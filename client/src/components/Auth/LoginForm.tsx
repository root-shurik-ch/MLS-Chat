import React, { useState } from 'react';
import {
  authenticatePasskeyDiscoverable,
  serializeGetResponse,
  isWebAuthnSupported,
  isPRFSupported,
} from '../../utils/webauthn';
import { generateDeviceId, decodeBase64Url } from '../../utils/crypto';
import { KeyManager } from '../../utils/keyManager';
import { AuthServiceSupabase } from '../../services/AuthServiceSupabase';

interface LoginFormProps {
  onSuccess: (userId: string, deviceId: string) => void;
}

const LoginForm: React.FC<LoginFormProps> = ({ onSuccess }) => {
  const [userIdInput, setUserIdInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const baseUrl =
      supabaseUrl && !supabaseUrl.includes('undefined')
        ? supabaseUrl.replace(/\/$/, '') + '/functions/v1'
        : '';

    try {
      if (!baseUrl) {
        setError('Server not configured. Set VITE_SUPABASE_URL in environment.');
        return;
      }
      if (!(await isWebAuthnSupported())) {
        setError('This browser does not support passkeys. Use a modern browser.');
        return;
      }
      if (!(await isPRFSupported())) {
        setError('Passkey with PRF (e.g. biometrics) is required. Use a supported device.');
        return;
      }

      const userId = userIdInput.trim();
      if (!userId) {
        setError('Enter your User ID to sign in with passkey');
        return;
      }

      const deviceId = generateDeviceId();
      const authService = new AuthServiceSupabase(baseUrl);
      const keyManager = new KeyManager();
      await keyManager.init();

      const { challengeId, challenge } = await authService.getChallenge('login');

      const { userId: resolvedUserId, credentialId, prfOutput, credential } =
        await authenticatePasskeyDiscoverable(challenge, userId);

      const webauthnGetResponse = serializeGetResponse(credential);

      const { authToken, profile, mlsPublicKey, mlsPrivateKeyEnc } =
        await authService.login({
          challengeId,
          userId: resolvedUserId,
          deviceId,
          webauthnGetResponse,
        });

      const mlsPublicKeyBytes = decodeBase64Url(mlsPublicKey);
      await keyManager.decryptAndStoreServerKeyWithPrf(
        mlsPrivateKeyEnc,
        resolvedUserId,
        deviceId,
        prfOutput,
        mlsPublicKeyBytes
      );

      localStorage.setItem('userId', resolvedUserId);
      localStorage.setItem('deviceId', deviceId);
      localStorage.setItem('authToken', authToken.value);
      localStorage.setItem('userProfile', JSON.stringify({
        userId: profile.userId,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
      }));

      onSuccess(resolvedUserId, deviceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Login</h2>
      <input
        type="text"
        placeholder="User ID (from registration)"
        value={userIdInput}
        onChange={(e) => setUserIdInput(e.target.value)}
        style={{ width: '100%', padding: 8, marginBottom: 10 }}
      />
      <button type="submit" disabled={loading}>
        {loading ? 'Signing in...' : 'Sign in with passkey'}
      </button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </form>
  );
};

export default LoginForm;
