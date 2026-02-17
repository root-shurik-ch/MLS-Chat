import type { UserProfile } from '../domain/User';

export interface AuthToken {
  value: string;
  expiresAt?: number;
}

export interface AuthService {
  getChallenge(): Promise<{ challenge: string; }>;

  register(input: {
    userId: string;
    displayName: string;
    mlsPublicKey: string;
    mlsPrivateKeyEnc: string;
    deviceId: string;
    webauthnCreateResponse: PublicKeyCredential;
  }): Promise<{
    authToken: AuthToken;
    profile: UserProfile;
  }>;

  login(input: {
    userId: string;
    deviceId: string;
    webauthnGetResponse: PublicKeyCredential;
  }): Promise<{
    authToken: AuthToken;
    profile: UserProfile;
    mlsPublicKey: string;
    mlsPrivateKeyEnc: string;
  }>;
}

