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
    const response = await fetch(`${this.baseUrl}/auth_challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (!response.ok) {
      throw new Error('Failed to get challenge');
    }
    const data = await response.json() as { challenge_id: string; challenge: string; ttl: number };
    return {
      challengeId: data.challenge_id,
      challenge: data.challenge,
      ttl: data.ttl,
    };
  }

  async register(input: {
    challengeId: string;
    userId: string;
    deviceId: string;
    displayName: string;
    mlsPublicKey: string;
    mlsPrivateKeyEnc: string;
    webauthnCreateResponse: Record<string, unknown>;
  }): Promise<{
    authToken: { value: string; expiresAt?: number };
    profile: UserProfile;
  }> {
    const response = await fetch(`${this.baseUrl}/auth_register`, {
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
    const text = await response.text();
    let data: { error?: string; auth_token?: string; profile?: UserProfile };
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }
    if (!response.ok) {
      const message = typeof data?.error === 'string' ? data.error : text || 'Registration failed';
      throw new Error(message);
    }
    if (typeof data.auth_token !== 'string') {
      throw new Error('Invalid registration response: missing auth_token');
    }
    if (!data.profile || typeof data.profile !== 'object') {
      throw new Error('Invalid registration response: missing profile');
    }
    return {
      authToken: { value: data.auth_token },
      profile: data.profile,
    };
  }

  async login(input: {
    challengeId: string;
    userId: string;
    deviceId: string;
    webauthnGetResponse: Record<string, unknown>;
  }): Promise<{
    authToken: { value: string; expiresAt?: number };
    profile: UserProfile;
    mlsPublicKey: string;
    mlsPrivateKeyEnc: string;
  }> {
    const response = await fetch(`${this.baseUrl}/auth_login`, {
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
    const data = (await response.json()) as {
      auth_token?: string;
      profile?: UserProfile;
      mls_public_key?: string;
      mls_private_key_enc?: string;
    };
    if (typeof data.auth_token !== 'string') {
      throw new Error('Invalid login response: missing auth_token');
    }
    if (!data.profile || typeof data.profile !== 'object') {
      throw new Error('Invalid login response: missing profile');
    }
    if (typeof data.mls_public_key !== 'string') {
      throw new Error('Invalid login response: missing mls_public_key');
    }
    if (typeof data.mls_private_key_enc !== 'string') {
      throw new Error('Invalid login response: missing mls_private_key_enc');
    }
    return {
      authToken: { value: data.auth_token },
      profile: data.profile,
      mlsPublicKey: data.mls_public_key,
      mlsPrivateKeyEnc: data.mls_private_key_enc,
    };
  }

  async getKeyPackage(userId: string, deviceId: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/auth_keypackage`, {
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
}