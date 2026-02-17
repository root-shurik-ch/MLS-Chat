// src/utils/webauthn.test.ts
import { describe, it, expect, vi } from 'vitest'
import { getPrfOutput, createPasskey, authenticatePasskey } from './webauthn'

describe('WebAuthn utils', () => {
  it('should get PRF output', async () => {
    const prf = await getPrfOutput('cred-id', 'user-id')
    expect(prf).toBeInstanceOf(Uint8Array)
    expect(prf.length).toBe(32)
  })

  it('should create passkey', async () => {
    const result = await createPasskey('user-id', 'challenge')
    expect(result.credentialId).toBe('mock-cred-id')
    expect(result.publicKey).toBe('mock-pub-key')
    expect(result.prfOutput).toBeInstanceOf(Uint8Array)
  })

  it('should authenticate passkey', async () => {
    const prf = await authenticatePasskey('cred-id', 'challenge', 'user-id')
    expect(prf).toBeInstanceOf(Uint8Array)
    expect(prf.length).toBe(32)
  })
})