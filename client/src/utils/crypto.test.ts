// src/utils/crypto.test.ts
import { describe, it, expect, vi, beforeAll } from 'vitest'
import {
  deriveKEnc,
  encryptMlsPrivateKey,
  decryptMlsPrivateKey,
  base64urlEncode,
  sha256,
  generateDeviceId,
  generateMlsKeys,
  deriveUserId,
} from './crypto'

beforeAll(() => {
  // Mock crypto.getRandomValues
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      ...globalThis.crypto,
      getRandomValues: vi.fn((array) => {
        for (let i = 0; i < array.length; i++) {
          array[i] = Math.floor(Math.random() * 256)
        }
        return array
      }),
      subtle: {
        importKey: vi.fn(() => Promise.resolve({})),
        deriveKey: vi.fn(() => Promise.resolve({})),
        encrypt: vi.fn(() => Promise.resolve(new Uint8Array(48))), // Mock ciphertext + tag
        decrypt: vi.fn((params, key, data) => Promise.resolve(data.slice(0, 32))), // Mock plaintext
        digest: vi.fn(() => Promise.resolve(new ArrayBuffer(32))),
      },
    },
  })
})

describe('crypto utils', () => {
  it('should derive KEnc from PRF output', async () => {
    const prfOutput = new Uint8Array(32)
    const key = await deriveKEnc(prfOutput)
    expect(key).toBeDefined()
    expect(crypto.subtle.importKey).toHaveBeenCalled()
    expect(crypto.subtle.deriveKey).toHaveBeenCalled()
  })

  it('should encrypt and decrypt MLS private key', async () => {
    const privateKey = new Uint8Array(32)
    const kEnc = {} as CryptoKey
    const userId = 'user123'

    const encrypted = await encryptMlsPrivateKey(privateKey, kEnc, userId)
    expect(encrypted).toBeDefined()
    expect(typeof encrypted).toBe('string')

    const decrypted = await decryptMlsPrivateKey(encrypted, kEnc, userId)
    expect(decrypted).toEqual(privateKey)
  })

  it('should base64url encode bytes', () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const encoded = base64urlEncode(bytes)
    expect(encoded).toBe('AQIDBA')
  })

  it('should compute SHA-256 hash', async () => {
    const data = new Uint8Array([1, 2, 3])
    const hash = await sha256(data)
    expect(hash).toBeInstanceOf(Uint8Array)
    expect(hash.length).toBe(32)
  })

  it('should generate device ID', () => {
    const deviceId = generateDeviceId()
    expect(deviceId).toBeDefined()
    expect(typeof deviceId).toBe('string')
  })

  it('should generate MLS keys', async () => {
    const keys = await generateMlsKeys()
    expect(keys.publicKey).toBeInstanceOf(Uint8Array)
    expect(keys.privateKey).toBeInstanceOf(Uint8Array)
  })

  it('should derive user ID from MLS public key', () => {
    const publicKey = new Uint8Array(32)
    const userId = deriveUserId(publicKey)
    expect(userId).toBeDefined()
    expect(typeof userId).toBe('string')
  })
})