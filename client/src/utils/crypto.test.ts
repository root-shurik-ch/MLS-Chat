// src/utils/crypto.test.ts
import { describe, it, expect } from 'vitest'
import {
  base64urlEncode,
  sha256,
  generateDeviceId,
  generateMlsKeys,
  deriveUserId,
  deriveKWasmState,
  deriveKMsgCache,
  encryptString,
  decryptString,
} from './crypto'

describe('crypto utils', () => {
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

  it('should generate device ID as non-empty string', () => {
    const deviceId = generateDeviceId()
    expect(typeof deviceId).toBe('string')
    expect(deviceId.length).toBeGreaterThan(0)
  })

  it('should generate MLS keys', async () => {
    const keys = await generateMlsKeys()
    expect(keys.publicKey).toBeInstanceOf(Uint8Array)
    expect(keys.privateKey).toBeInstanceOf(Uint8Array)
  })

  it('should derive user ID from MLS public key', () => {
    const publicKey = new Uint8Array(32)
    const userId = deriveUserId(publicKey)
    expect(typeof userId).toBe('string')
    expect(userId.length).toBeGreaterThan(0)
  })

  it('deriveKWasmState and deriveKMsgCache are domain-separated', async () => {
    const prf = crypto.getRandomValues(new Uint8Array(32))
    const kWasm = await deriveKWasmState(prf)
    const kMsgCache = await deriveKMsgCache(prf)
    // Both return CryptoKey objects
    expect(kWasm).toBeInstanceOf(CryptoKey)
    expect(kMsgCache).toBeInstanceOf(CryptoKey)
    // Same PRF → different keys (different HKDF info strings)
    // We verify by round-tripping encryption: a ciphertext from kWasm must not decrypt with kMsgCache
    const plain = 'hello'
    const enc = await encryptString(plain, kWasm, 'aad')
    await expect(decryptString(enc, kMsgCache, 'aad')).rejects.toThrow()
  })

  it('encryptString / decryptString round-trip', async () => {
    const prf = crypto.getRandomValues(new Uint8Array(32))
    const key = await deriveKWasmState(prf)
    const plaintext = 'the quick brown fox'
    const encrypted = await encryptString(plaintext, key, 'test-aad')
    const decrypted = await decryptString(encrypted, key, 'test-aad')
    expect(decrypted).toBe(plaintext)
  })

  it('decryptString fails with wrong AAD', async () => {
    const prf = crypto.getRandomValues(new Uint8Array(32))
    const key = await deriveKWasmState(prf)
    const encrypted = await encryptString('secret', key, 'correct-aad')
    await expect(decryptString(encrypted, key, 'wrong-aad')).rejects.toThrow()
  })
})
