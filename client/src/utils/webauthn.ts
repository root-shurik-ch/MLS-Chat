// src/utils/webauthn.ts
export async function getPrfOutput(
  credentialId: string,
  userId: string
): Promise<Uint8Array> {
  // Mock PRF output for testing
  // In real implementation, use WebAuthn PRF extension
  return crypto.getRandomValues(new Uint8Array(32))
}

export async function createPasskey(
  userId: string,
  challenge: string
): Promise<{
  credentialId: string
  publicKey: string
  prfOutput: Uint8Array
}> {
  // Mock WebAuthn create
  const credentialId = 'mock-cred-id'
  const publicKey = 'mock-pub-key'
  const prfOutput = await getPrfOutput(credentialId, userId)
  return { credentialId, publicKey, prfOutput }
}

export async function authenticatePasskey(
  credentialId: string,
  challenge: string,
  userId: string
): Promise<Uint8Array> {
  // Mock WebAuthn get
  return getPrfOutput(credentialId, userId)
}