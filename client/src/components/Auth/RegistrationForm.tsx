import React, { useState } from 'react';
import {
  createPasskey,
  authenticatePasskey,
  serializeCreationResult,
  isWebAuthnSupported,
  isPRFSupported,
} from '../../utils/webauthn';
import {
  generateDeviceId,
  generateMlsKeys,
  encryptMlsPrivateKey,
  deriveKEnc,
  encodeBase64Url,
} from '../../utils/crypto';
import { KeyManager } from '../../utils/keyManager';

const NAME_MAX_LENGTH = 64;
import { AuthServiceSupabase } from '../../services/AuthServiceSupabase';

interface RegistrationFormProps {
  onSuccess: (userId: string, deviceId: string) => void;
}

const RegistrationForm: React.FC<RegistrationFormProps> = ({ onSuccess }) => {
  const [displayName, setDisplayName] = useState('');
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

      const userId = displayName.trim();
      if (userId.length === 0) {
        setError('Name is required');
        return;
      }
      if (userId.length > NAME_MAX_LENGTH) {
        setError(`Name must be at most ${NAME_MAX_LENGTH} characters`);
        return;
      }

      const deviceId = generateDeviceId();
      const authService = new AuthServiceSupabase(baseUrl);
      const keyManager = new KeyManager();
      await keyManager.init();

      const { challengeId, challenge } = await authService.getChallenge('register');

      const createResult = await createPasskey(userId, challenge, userId);

      const { challenge: loginChallenge } = await authService.getChallenge('login');
      const authResult = await authenticatePasskey(
        createResult.credentialId,
        loginChallenge,
        userId
      );

      const prfOutput = authResult.prfOutput;
      const kEnc = await deriveKEnc(prfOutput);
      const { publicKey: mlsPublicKey, privateKey: mlsPrivateKey } = await generateMlsKeys();
      const mlsPrivateKeyEnc = await encryptMlsPrivateKey(mlsPrivateKey, kEnc, userId);

      const webauthnCreateResponse = serializeCreationResult({
        credentialId: createResult.credentialId,
        attestationObject: createResult.attestationObject,
        clientDataJSON: createResult.clientDataJSON,
      });

      const { authToken, profile } = await authService.register({
        challengeId,
        userId,
        deviceId,
        displayName: userId,
        mlsPublicKey: encodeBase64Url(mlsPublicKey),
        mlsPrivateKeyEnc,
        webauthnCreateResponse,
      });

      await keyManager.storeKeys(userId, deviceId, mlsPrivateKey, mlsPublicKey, kEnc);

      localStorage.setItem('userId', userId);
      localStorage.setItem('deviceId', deviceId);
      localStorage.setItem('authToken', authToken.value);
      localStorage.setItem('userProfile', JSON.stringify({
        userId: profile.userId,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
      }));

      onSuccess(userId, deviceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: 20 }}>
      <h2>Register</h2>
      <input
        type="text"
        placeholder="Your name (unique, cannot be changed later)"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        required
        style={{ width: '100%', padding: 8, marginBottom: 10 }}
      />
      <button type="submit" disabled={loading}>
        {loading ? 'Registering...' : 'Register'}
      </button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </form>
  );
};

export default RegistrationForm;
