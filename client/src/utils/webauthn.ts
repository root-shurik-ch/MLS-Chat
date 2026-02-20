// src/utils/webauthn.ts
import { encodeBase64Url, decodeBase64Url } from './crypto'

export interface PasskeyCreationOptions {
  rp: {
    id: string
    name: string
  }
  user: {
    id: Uint8Array
    name: string
    displayName: string
  }
  challenge: Uint8Array
  pubKeyCredParams: Array<{
    type: 'public-key'
    alg: number
  }>
  authenticatorSelection?: AuthenticatorSelectionCriteria
  timeout?: number
  attestation?: AttestationConveyancePreference
  extensions?: AuthenticationExtensionsClientInputs
}

export interface PasskeyRequestOptions {
  rpId: string
  challenge: Uint8Array
  timeout?: number
  userVerification?: UserVerificationRequirement
  extensions?: AuthenticationExtensionsClientInputs
}

export async function createPasskey(
  userId: string,
  challenge: string,
  displayName: string
): Promise<{
  credentialId: string
  publicKey: string
  prfOutput: Uint8Array | null
  attestationObject: string
  clientDataJSON: string
}> {
  const rpId = window.location.hostname
  const userIdBytes = new TextEncoder().encode(userId)
  const challengeBytes = decodeBase64Url(challenge)

  const publicKey: PublicKeyCredentialCreationOptions = {
    rp: {
      id: rpId,
      name: 'MLS Chat'
    },
    user: {
      id: userIdBytes,
      name: displayName,
      displayName: displayName
    },
    challenge: challengeBytes,
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },  // ES256
      { type: 'public-key', alg: -257 }, // RS256
      { type: 'public-key', alg: -8 },   // Ed25519
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'required',
      requireResidentKey: true
    },
    timeout: 60000,
    attestation: 'direct',
    extensions: {
      prf: {
        eval: {
          first: userIdBytes  // Use userId as salt for PRF
        }
      }
    }
  }

  try {
    const credential = await navigator.credentials.create({
      publicKey
    }) as PublicKeyCredential

    if (!credential) {
      throw new Error('Credential creation failed')
    }

    const response = credential.response as AuthenticatorAttestationResponse
    const credentialId = encodeBase64Url(new Uint8Array(credential.rawId))
    const publicKeySpki = encodeBase64Url(new Uint8Array(response.getPublicKey()))
    const attestationObject = encodeBase64Url(new Uint8Array(response.attestationObject))
    const clientDataJSON = encodeBase64Url(new Uint8Array(response.clientDataJSON))

    // Extract PRF extension status
    let prfOutput: Uint8Array | null = null
    const prfExtension = credential.getClientExtensionResults()?.prf

    if (prfExtension?.enabled) {
      // PRF is supported, but output only available during authentication
      // Return null - client must authenticate immediately after registration to get PRF output
      prfOutput = null
    } else {
      // PRF not supported by authenticator
      throw new Error('PRF extension not supported by authenticator. Please use a device with biometric authentication.')
    }

    return {
      credentialId,
      publicKey: publicKeySpki,
      prfOutput,
      attestationObject,
      clientDataJSON
    }
  } catch (error) {
    console.error('WebAuthn creation error:', error)
    throw new Error(`WebAuthn registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function authenticatePasskey(
  credentialId: string,
  challenge: string,
  userId: string
): Promise<{
  prfOutput: Uint8Array
  credentialId: string
  authenticatorData: string
  clientDataJSON: string
  signature: string
}> {
  const rpId = window.location.hostname
  const userIdBytes = new TextEncoder().encode(userId)
  const challengeBytes = decodeBase64Url(challenge)
  const credentialIdBytes = decodeBase64Url(credentialId)

  const publicKey: PublicKeyCredentialRequestOptions = {
    rpId,
    challenge: challengeBytes,
    timeout: 60000,
    userVerification: 'required',
    allowCredentials: [{
      type: 'public-key',
      id: credentialIdBytes,
      transports: ['internal']
    }],
    extensions: {
      prf: {
        eval: {
          first: userIdBytes  // Same salt used during creation
        }
      }
    }
  }

  try {
    const assertion = await navigator.credentials.get({
      publicKey
    }) as PublicKeyCredential

    if (!assertion) {
      throw new Error('Authentication failed')
    }

    const response = assertion.response as AuthenticatorAssertionResponse
    const prfExtension = assertion.getClientExtensionResults()?.prf
    
    if (!prfExtension?.results?.first) {
      throw new Error('PRF extension not supported or no output received')
    }

    const prfOutput = new Uint8Array(prfExtension.results.first)
    const assertionCredentialId = encodeBase64Url(new Uint8Array(assertion.rawId))
    const authenticatorData = encodeBase64Url(new Uint8Array(response.authenticatorData))
    const clientDataJSON = encodeBase64Url(new Uint8Array(response.clientDataJSON))
    const signature = encodeBase64Url(new Uint8Array(response.signature))

    return {
      prfOutput,
      credentialId: assertionCredentialId,
      authenticatorData,
      clientDataJSON,
      signature
    }
  } catch (error) {
    console.error('WebAuthn authentication error:', error)
    throw new Error(`WebAuthn authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Get PRF output by authenticating with an existing credential.
 * This re-authenticates the user to derive the encryption key.
 *
 * @param credentialId - Base64url-encoded credential ID
 * @param userId - User ID (used as PRF salt)
 * @returns 32-byte PRF output for key derivation
 */
export async function getPrfOutput(
  credentialId: string,
  userId: string
): Promise<Uint8Array> {
  // Generate a challenge (can be random for key derivation)
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const challengeBase64 = encodeBase64Url(challenge);

  // Authenticate to get PRF output
  const result = await authenticatePasskey(credentialId, challengeBase64, userId);

  // Return the PRF output
  return result.prfOutput;
}

export function isWebAuthnSupported(): boolean {
  return !!(
    window.PublicKeyCredential &&
    typeof navigator.credentials?.create === 'function' &&
    typeof navigator.credentials?.get === 'function'
  )
}

/**
 * Check if PRF extension is supported.
 * Note: Most reliable method is to attempt PRF usage and check results.
 * This function does basic capability detection.
 */
export async function isPRFSupported(): Promise<boolean> {
  if (!isWebAuthnSupported()) {
    return false;
  }

  // Check if platform authenticator is available
  if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
    return false;
  }

  const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();

  // Assume PRF is supported if platform authenticator exists
  // (Chrome 108+, Safari 17+, Edge 108+)
  // The actual PRF support will be checked during credential creation/authentication
  return available;
}

/**
 * Serialize PublicKeyCredential (creation) for JSON send to server.
 */
export function serializeCreationResponse(credential: PublicKeyCredential): Record<string, unknown> {
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: encodeBase64Url(new Uint8Array(credential.rawId)),
    type: credential.type,
    response: {
      clientDataJSON: encodeBase64Url(new Uint8Array(response.clientDataJSON)),
      attestationObject: encodeBase64Url(new Uint8Array(response.attestationObject)),
    },
  };
}

/**
 * Serialize creation result (from createPasskey) for JSON send to server.
 */
export function serializeCreationResult(result: {
  credentialId: string;
  attestationObject: string;
  clientDataJSON: string;
}): Record<string, unknown> {
  return {
    id: result.credentialId,
    rawId: result.credentialId,
    type: 'public-key',
    response: {
      clientDataJSON: result.clientDataJSON,
      attestationObject: result.attestationObject,
    },
  };
}

/**
 * Serialize PublicKeyCredential (get) for JSON send to server.
 */
export function serializeGetResponse(credential: PublicKeyCredential): Record<string, unknown> {
  const response = credential.response as AuthenticatorAssertionResponse;
  const out: Record<string, unknown> = {
    id: credential.id,
    rawId: encodeBase64Url(new Uint8Array(credential.rawId)),
    type: credential.type,
    response: {
      clientDataJSON: encodeBase64Url(new Uint8Array(response.clientDataJSON)),
      authenticatorData: encodeBase64Url(new Uint8Array(response.authenticatorData)),
      signature: encodeBase64Url(new Uint8Array(response.signature)),
    },
  };
  if (response.userHandle && response.userHandle.byteLength > 0) {
    (out.response as Record<string, unknown>).userHandle = encodeBase64Url(
      new Uint8Array(response.userHandle)
    );
  }
  return out;
}

/**
 * Authenticate with resident/discoverable key (no credentialId needed).
 * Browser shows passkey picker.
 * userId is required for PRF salt (same as at registration) to derive kEnc for key decryption.
 */
export async function authenticatePasskeyDiscoverable(
  challenge: string,
  userId: string
): Promise<{
  userId: string;
  credentialId: string;
  prfOutput: Uint8Array;
  credential: PublicKeyCredential;
}> {
  const rpId = window.location.hostname;
  const challengeBytes = decodeBase64Url(challenge);
  const userIdBytes = new TextEncoder().encode(userId);

  const publicKey: PublicKeyCredentialRequestOptions = {
    rpId,
    challenge: challengeBytes,
    timeout: 60000,
    userVerification: 'required',
    allowCredentials: [],
    extensions: {
      prf: {
        eval: {
          first: userIdBytes,
        },
      },
    },
  };

  const credential = (await navigator.credentials.get({
    publicKey,
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error('Authentication failed or cancelled');
  }

  const response = credential.response as AuthenticatorAssertionResponse;
  const prfExtension = credential.getClientExtensionResults()?.prf;
  if (!prfExtension?.results?.first) {
    throw new Error('PRF extension required for login');
  }

  const prfOutput = new Uint8Array(prfExtension.results.first);
  const credentialId = encodeBase64Url(new Uint8Array(credential.rawId));
  const userHandle = response.userHandle && response.userHandle.byteLength > 0
    ? new TextDecoder().decode(response.userHandle)
    : '';
  const resolvedUserId = userHandle || userId;

  return {
    userId: resolvedUserId,
    credentialId,
    prfOutput,
    credential,
  };
}