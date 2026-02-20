// crypto utilities for MLS key encryption

export async function deriveKEnc(prfOutput: Uint8Array): Promise<CryptoKey> {
  const salt = new TextEncoder().encode("MLS-KDF-Salt");
  const info = new TextEncoder().encode("MLS-PrivateKey-Encryption");
  // NOTE: keep "MLS-PrivateKey-Encryption" as info here — changing it
  // would invalidate all existing mls_sk_enc values in the DB.

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    prfOutput,
    'HKDF',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt,
      info: info,
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Derive the AES-256 key used to encrypt/decrypt the WASM state blob.
 * Uses a different HKDF info string than deriveKEnc so the two keys are
 * domain-separated — compromising one does not compromise the other.
 * Output is the same on any device that authenticates with the same passkey.
 */
export async function deriveKWasmState(prfOutput: Uint8Array): Promise<CryptoKey> {
  const salt = new TextEncoder().encode("MLS-KDF-Salt");
  const info = new TextEncoder().encode("MLS-WasmState-Encryption");

  const keyMaterial = await crypto.subtle.importKey(
    'raw', prfOutput, 'HKDF', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt an arbitrary UTF-8 string (e.g. JSON) with AES-256-GCM.
 * Returns base64-encoded ciphertext||iv.
 */
export async function encryptString(
  plaintext: string,
  key: CryptoKey,
  aad: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plaintext);
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(aad) },
    key,
    data,
  );
  const combined = new Uint8Array(new Uint8Array(cipher).length + 12);
  combined.set(new Uint8Array(cipher));
  combined.set(iv, new Uint8Array(cipher).length);
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a string previously encrypted with encryptString.
 */
export async function decryptString(
  encrypted: string,
  key: CryptoKey,
  aad: string,
): Promise<string> {
  const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  const ciphertextLen = combined.length - 12;
  const ciphertext = combined.slice(0, ciphertextLen);
  const iv = combined.slice(ciphertextLen);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(aad) },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plaintext);
}

export async function encryptMlsPrivateKey(
  mlsPrivateKeyBytes: Uint8Array,
  kEnc: CryptoKey,
  userId: string
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = new TextEncoder().encode(userId);

  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv, additionalData: aad },
    kEnc,
    mlsPrivateKeyBytes
  );

  const ciphertext = new Uint8Array(cipher);
  const combined = new Uint8Array(ciphertext.length + iv.length);
  combined.set(ciphertext);
  combined.set(iv, ciphertext.length);

  return btoa(String.fromCharCode(...combined));
}

export async function decryptMlsPrivateKey(
  encrypted: string,
  kEnc: CryptoKey,
  userId: string
): Promise<Uint8Array> {
  const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  const ciphertextLen = combined.length - 12;
  const ciphertext = combined.slice(0, ciphertextLen);
  const iv = combined.slice(ciphertextLen);

  const aad = new TextEncoder().encode(userId);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv, additionalData: aad },
    kEnc,
    ciphertext
  );

  return new Uint8Array(plaintext);
}

export function base64urlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export function encodeBase64Url(bytes: Uint8Array): string {
  return base64urlEncode(bytes)
}

export function decodeBase64Url(base64url: string): Uint8Array {
  const base64 = base64url
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(base64url.length + (4 - (base64url.length % 4)) % 4, '=')
  
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
}

export function generateDeviceId(): string {
  return base64urlEncode(crypto.getRandomValues(new Uint8Array(16)));
}

// Mock MLS key generation (replace with real MLS later)
export async function generateMlsKeys(): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array }> {
  const privateKey = crypto.getRandomValues(new Uint8Array(32));
  const publicKey = await sha256(privateKey); // Mock, real MLS has proper keypair
  return { publicKey, privateKey };
}

export function deriveUserId(mlsPublicKey: Uint8Array): string {
  return base64urlEncode(mlsPublicKey);
}