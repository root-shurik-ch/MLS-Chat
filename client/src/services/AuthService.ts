import type { UserProfile } from '../domain/User';

export interface AuthToken {
  value: string;
  expiresAt?: number;
}

export interface AuthService {
  getChallenge(action: 'register' | 'login'): Promise<{
    challengeId: string;
    challenge: string;
    ttl: number;
  }>;

  register(input: {
    challengeId: string;
    userId: string;
    deviceId: string;
    displayName: string;
    mlsPublicKey: string;
    mlsPrivateKeyEnc: string;
    webauthnCreateResponse: PublicKeyCredential;
  }): Promise<{
    authToken: AuthToken;
    profile: UserProfile;
  }>;

  login(input: {
    challengeId: string;
    userId: string;
    deviceId: string;
    webauthnGetResponse: PublicKeyCredential;
  }): Promise<{
    authToken: AuthToken;
    profile: UserProfile;
    mlsPublicKey: string;
    mlsPrivateKeyEnc: string;
  }>;

  getKeyPackage(userId: string, deviceId: string): Promise<string>;
}

