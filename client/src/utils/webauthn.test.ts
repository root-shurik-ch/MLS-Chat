// src/utils/webauthn.test.ts
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import { getPrfOutput, createPasskey, authenticatePasskey, isPRFSupported, isWebAuthnSupported } from './webauthn'

describe('WebAuthn utils', () => {
  // Mock PRF output (32 random bytes)
  const mockPrfOutput = new Uint8Array(32)
  crypto.getRandomValues(mockPrfOutput)

  beforeAll(() => {
    // Setup global WebAuthn mocks
    if (!(global as any).PublicKeyCredential) {
      (global as any).PublicKeyCredential = class PublicKeyCredential {
        static isUserVerifyingPlatformAuthenticatorAvailable = vi.fn().mockResolvedValue(true)
      }
    }

    if (!(global as any).navigator) {
      (global as any).navigator = {} as any
    }

    if (!(global as any).navigator.credentials) {
      (global as any).navigator.credentials = {
        create: vi.fn(),
        get: vi.fn()
      } as any
    }

    if (!(global as any).window) {
      (global as any).window = {
        PublicKeyCredential: (global as any).PublicKeyCredential,
        location: {
          hostname: 'localhost'
        }
      } as any
    }
  })

  beforeEach(() => {
    // Reset PublicKeyCredential mock
    const PKC = (global as any).PublicKeyCredential
    if (PKC) {
      PKC.isUserVerifyingPlatformAuthenticatorAvailable = vi.fn().mockResolvedValue(true)
    }

    // Mock navigator.credentials.create
    vi.spyOn(navigator.credentials, 'create').mockResolvedValue({
      id: 'mock-cred-id',
      rawId: new ArrayBuffer(16),
      type: 'public-key',
      response: {
        attestationObject: new ArrayBuffer(128),
        clientDataJSON: new ArrayBuffer(64),
        getPublicKey: () => new ArrayBuffer(65),
        getAuthenticatorData: () => new ArrayBuffer(37),
        getPublicKeyAlgorithm: () => -7,
        getTransports: () => ['internal']
      } as AuthenticatorAttestationResponse,
      getClientExtensionResults: () => ({
        prf: {
          enabled: true
        }
      }),
      authenticatorAttachment: 'platform'
    } as PublicKeyCredential)

    // Mock navigator.credentials.get
    vi.spyOn(navigator.credentials, 'get').mockResolvedValue({
      id: 'mock-cred-id',
      rawId: new ArrayBuffer(16),
      type: 'public-key',
      response: {
        authenticatorData: new ArrayBuffer(37),
        clientDataJSON: new ArrayBuffer(64),
        signature: new ArrayBuffer(64),
        userHandle: new ArrayBuffer(8)
      } as AuthenticatorAssertionResponse,
      getClientExtensionResults: () => ({
        prf: {
          enabled: true,
          results: {
            first: mockPrfOutput.buffer
          }
        }
      }),
      authenticatorAttachment: 'platform'
    } as PublicKeyCredential)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getPrfOutput', () => {
    it('should return 32-byte PRF output', async () => {
      const prf = await getPrfOutput('cred-id', 'user-id')
      expect(prf).toBeInstanceOf(Uint8Array)
      expect(prf.length).toBe(32)
    })

    it('should call authenticatePasskey with credential and user', async () => {
      const result = await getPrfOutput('test-cred-id', 'test-user-id')
      expect(result).toEqual(mockPrfOutput)
      expect(navigator.credentials.get).toHaveBeenCalled()
    })
  })

  describe('createPasskey', () => {
    it('should create passkey with PRF enabled', async () => {
      const result = await createPasskey('user-id', 'Y2hhbGxlbmdl', 'Test User')
      expect(result.credentialId).toBeDefined()
      expect(result.publicKey).toBeDefined()
      expect(result.prfOutput).toBeNull() // PRF output not available during creation
      expect(result.attestationObject).toBeDefined()
      expect(result.clientDataJSON).toBeDefined()
    })

    it('should throw error if PRF not supported', async () => {
      // Mock PRF not enabled
      vi.spyOn(navigator.credentials, 'create').mockResolvedValue({
        id: 'mock-cred-id',
        rawId: new ArrayBuffer(16),
        type: 'public-key',
        response: {
          attestationObject: new ArrayBuffer(128),
          clientDataJSON: new ArrayBuffer(64),
          getPublicKey: () => new ArrayBuffer(65),
          getAuthenticatorData: () => new ArrayBuffer(37),
          getPublicKeyAlgorithm: () => -7,
          getTransports: () => ['internal']
        } as AuthenticatorAttestationResponse,
        getClientExtensionResults: () => ({
          prf: {
            enabled: false // PRF not supported
          }
        }),
        authenticatorAttachment: 'platform'
      } as PublicKeyCredential)

      await expect(createPasskey('user-id', 'Y2hhbGxlbmdl', 'Test User'))
        .rejects.toThrow('PRF extension not supported by authenticator')
    })
  })

  describe('authenticatePasskey', () => {
    it('should authenticate and return PRF output', async () => {
      const result = await authenticatePasskey('cred-id', 'Y2hhbGxlbmdl', 'user-id')
      expect(result.prfOutput).toBeInstanceOf(Uint8Array)
      expect(result.prfOutput.length).toBe(32)
      expect(result.credentialId).toBeDefined()
      expect(result.authenticatorData).toBeDefined()
      expect(result.clientDataJSON).toBeDefined()
      expect(result.signature).toBeDefined()
    })

    it('should throw error if PRF output not available', async () => {
      // Mock no PRF output
      vi.spyOn(navigator.credentials, 'get').mockResolvedValue({
        id: 'mock-cred-id',
        rawId: new ArrayBuffer(16),
        type: 'public-key',
        response: {
          authenticatorData: new ArrayBuffer(37),
          clientDataJSON: new ArrayBuffer(64),
          signature: new ArrayBuffer(64),
          userHandle: new ArrayBuffer(8)
        } as AuthenticatorAssertionResponse,
        getClientExtensionResults: () => ({
          prf: {
            enabled: false
          }
        }),
        authenticatorAttachment: 'platform'
      } as PublicKeyCredential)

      await expect(authenticatePasskey('cred-id', 'Y2hhbGxlbmdl', 'user-id'))
        .rejects.toThrow('PRF extension not supported or no output received')
    })
  })

  describe('isPRFSupported', () => {
    it('should return true when platform authenticator is available', async () => {
      const supported = await isPRFSupported()
      expect(supported).toBe(true)
    })

    it('should return false when platform authenticator is not available', async () => {
      const PKC = (global as any).PublicKeyCredential
      PKC.isUserVerifyingPlatformAuthenticatorAvailable = vi.fn().mockResolvedValue(false)
      const supported = await isPRFSupported()
      expect(supported).toBe(false)
    })
  })

  describe('isWebAuthnSupported', () => {
    it('should return true when WebAuthn APIs are available', () => {
      // Ensure window.PublicKeyCredential is defined
      if (!(global as any).window.PublicKeyCredential) {
        (global as any).window.PublicKeyCredential = (global as any).PublicKeyCredential
      }
      const supported = isWebAuthnSupported()
      expect(supported).toBe(true)
    })
  })
})