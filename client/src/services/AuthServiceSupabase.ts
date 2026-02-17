import type { AuthService } from './AuthService';
import type { UserProfile } from '../domain/User';

export class AuthServiceSupabase implements AuthService {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async getChallenge(action: 'register' | 'login'): Promise<{
    challengeId: string;
    challenge: string;
    ttl: number;
  }> {
    const response = await fetch(`${this.baseUrl}/auth/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (!response.ok) {
      throw new Error('Failed to get challenge');
    }
    return response.json();
  }

  async register(input: {
    challengeId: string;
    userId: string;
    deviceId: string;
    displayName: string;
    mlsPublicKey: string;
    mlsPrivateKeyEnc: string;
    webauthnCreateResponse: PublicKeyCredential;
  }): Promise<{
    authToken: { value: string; expiresAt?: number };
    profile: UserProfile;
  }> {
    const response = await fetch(`${this.baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challenge_id: input.challengeId,
        user_id: input.userId,
        device_id: input.deviceId,
        display_name: input.displayName,
        mls_public_key: input.mlsPublicKey,
        mls_private_key_enc: input.mlsPrivateKeyEnc,
        webauthn_create_response: input.webauthnCreateResponse,
      }),
    });
    if (!response.ok) {
      throw new Error('Registration failed');
    }
    const data = await response.json();
    return {
      authToken: { value: data.auth_token },
      profile: data.profile,
    };
  }

  async login(input: {
    challengeId: string;
    userId: string;
    deviceId: string;
    webauthnGetResponse: PublicKeyCredential;
  }): Promise<{
    authToken: { value: string; expiresAt?: number };
    profile: UserProfile;
    mlsPublicKey: string;
    mlsPrivateKeyEnc: string;
  }> {
    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challenge_id: input.challengeId,
        user_id: input.userId,
        device_id: input.deviceId,
        webauthn_get_response: input.webauthnGetResponse,
      }),
    });
    if (!response.ok) {
      throw new Error('Login failed');
    }
    const data = await response.json();
    return {
      authToken: { value: data.auth_token },
      profile: data.profile,
      mlsPublicKey: data.mls_public_key,
      mlsPrivateKeyEnc: data.mls_private_key_enc,
    };
  async getKeyPackage(userId: string, deviceId: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/auth/keypackage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        device_id: deviceId,
      }),
    });
    if (!response.ok) {
      throw new Error('Failed to get key package');
    }
    const data = await response.json();
    return data.key_package;
  }