import React, { useState } from 'react';
import { AuthServiceSupabase } from '../../services/AuthServiceSupabase';
import { deriveKEnc, decryptMlsPrivateKey } from '../../utils/crypto';

const authService = new AuthServiceSupabase('https://your-supabase-url.supabase.co/functions/v1'); // TODO: configure

const LoginForm: React.FC = () => {
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!navigator.credentials) {
      setError('WebAuthn is not supported in this browser.');
      setLoading(false);
      return;
    }

    try {
      const deviceId = localStorage.getItem('deviceId') || crypto.randomUUID(); // use stored or new
      const { challengeId, challenge } = await authService.getChallenge('login');
      const challengeBytes = Uint8Array.from(atob(challenge), c => c.charCodeAt(0));

      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: challengeBytes,
          rpId: window.location.hostname,
          allowCredentials: [],
          extensions: {
            prf: {
              eval: {
                first: new Uint8Array(32),
              },
            },
          },
        },
      }) as PublicKeyCredential;

      const result = await authService.login({
        challengeId,
        userId,
        deviceId,
        webauthnGetResponse: credential,
      });

      // Decrypt MLS private key
      const prfResult = credential.getClientExtensionResults().prf;
      if (!prfResult || !prfResult.eval.outputs.first) {
        throw new Error('PRF not supported or failed');
      }
      const prfOutput = new Uint8Array(prfResult.eval.outputs.first);
      const kEnc = await deriveKEnc(prfOutput);
      const mlsPrivateKey = await decryptMlsPrivateKey(result.mlsPrivateKeyEnc, kEnc, result.profile.userId);

      // Store data
      localStorage.setItem('authToken', result.authToken.value);
      localStorage.setItem('userProfile', JSON.stringify(result.profile));
      localStorage.setItem('userId', result.profile.userId);
      localStorage.setItem('deviceId', deviceId);
      localStorage.setItem('mlsPublicKey', result.mlsPublicKey);
      localStorage.setItem('mlsPrivateKey', btoa(String.fromCharCode(...mlsPrivateKey))); // store decrypted for MLS layer

      alert('Login successful!');
      // TODO: navigate to main app
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
        placeholder="User ID"
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        required
      />
      <button type="submit" disabled={loading}>
        {loading ? 'Logging in...' : 'Login'}
      </button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </form>
  );
};

export default LoginForm;