import type { UserProfile } from '../domain/User';

export interface AuthToken {
  value: string;
  expiresAt?: number;
}

export interface AuthService {
  getChallenge(action: 'register' | 'login', nameOrId?: string): Promise<{
    challengeId: string;
    challenge: string;
    ttl: number;
    userId?: string;
  }>;

  register(input: {
    challengeId: string;
    userId: string;
    deviceId: string;
    mlsPublicKey: string;
    /** @deprecated MLS private key is now derived client-side from PRF via HKDF — not sent to server */
    mlsPrivateKeyEnc?: string;
    webauthnCreateResponse: Record<string, unknown>;
  }): Promise<{
    authToken: AuthToken;
    profile: UserProfile;
  }>;

  login(input: {
    challengeId: string;
    userId: string;
    deviceId: string;
    webauthnGetResponse: Record<string, unknown>;
  }): Promise<{
    authToken: AuthToken;
    profile: UserProfile;
    /** MLS identity public key stored on the server (needed for KeyPackage invites) */
    mlsPublicKey: string | null;
    /** Encrypted WASM state blob for cross-device restore, or null if not yet uploaded */
    wasmStateEnc: string | null;
  }>;

  getKeyPackage(userId: string, deviceId: string): Promise<string>;
}
