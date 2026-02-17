# Identity and Passkeys

This document describes how user identities are managed, how MLS private keys are encrypted, and the WebAuthn/passkey integration for secure key derivation.

## User ID Derivation

The `user_id` is derived from the MLS public key to ensure uniqueness and avoid collisions.

- `user_id = base64url(SHA256(mls_public_key_bytes))`

This ensures the user ID is deterministic and tied to the cryptographic identity.

## MLS Private Key Encryption

The MLS private key is never sent in plaintext to the server. Instead, it is encrypted using a symmetric key derived from the passkey via WebAuthn PRF (Pseudo-Random Function).

### Key Derivation (K_enc)

The encryption key `K_enc` is derived using HKDF-SHA256:

- Input: PRF output from WebAuthn (32 bytes)
- Salt: "MLS-KDF-Salt" (UTF-8 bytes)
- Info: "MLS-PrivateKey-Encryption" (UTF-8 bytes)
- Output: 32 bytes (AES-256 key)

Pseudocode:

```javascript
function deriveKEnc(prfOutput) {
  const salt = new TextEncoder().encode("MLS-KDF-Salt");
  const info = new TextEncoder().encode("MLS-PrivateKey-Encryption");
  return hkdfSha256(prfOutput, salt, info, 32);
}
```

### Encryption

The MLS private key is encrypted using AES-256-GCM:

- Key: `K_enc`
- IV: Random 12 bytes (stored alongside ciphertext)
- AAD: `user_id` (for authenticity)

Pseudocode:

```javascript
function encryptMlsPrivateKey(mlsPrivateKeyBytes, kEnc, userId) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = new TextEncoder().encode(userId);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv, additionalData: aad },
    kEnc,
    mlsPrivateKeyBytes
  );
  return { ciphertext: new Uint8Array(cipher), iv: iv };
}
```

### Decryption

Decryption reverses the process:

```javascript
function decryptMlsPrivateKey(encryptedData, kEnc, userId) {
  const { ciphertext, iv } = encryptedData;
  const aad = new TextEncoder().encode(userId);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv, additionalData: aad },
    kEnc,
    ciphertext
  );
  return new Uint8Array(plaintext);
}
```

## WebAuthn Challenge Flow

1. Client calls `POST /auth/challenge` to get a challenge.
2. Client performs WebAuthn operation (createCredential or getAssertion) with the challenge.
3. For PRF, client requests PRF extension in the WebAuthn call.
4. Server validates the response (see [auth_service.md](auth_service.md) Server Validation).
5. Client derives `K_enc` from PRF output to encrypt/decrypt MLS keys.

## Multi-Device Support

Each device has a unique `device_id` (UUID). The same `user_id` can have multiple devices.

- MLS state is per-device (IndexedDB).
- Passkey can be shared across devices (if supported by authenticator).
- Device-specific KeyPackages are generated for each device.

Device ID is generated as `base64url(randomUUID())` on first use.