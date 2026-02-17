import React, { useState } from 'react';
import { AuthServiceSupabase } from '../../services/AuthServiceSupabase';
import { generateDeviceId, deriveKEnc, encryptMlsPrivateKey, generateMlsKeys, deriveUserId } from '../../utils/crypto';

const authService = new AuthServiceSupabase('https://your-supabase-url.supabase.co/functions/v1'); // TODO: configure

const RegistrationForm: React.FC = () => {
  const [displayName, setDisplayName] = useState('');
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
      const deviceId = generateDeviceId();
      const { challengeId, challenge } = await authService.getChallenge('register');
      const challengeBytes = Uint8Array.from(atob(challenge), c => c.charCodeAt(0));

      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: challengeBytes,
          rp: { name: 'MLS Chat', id: window.location.hostname },
          user: {
            id: crypto.getRandomValues(new Uint8Array(16)),
            name: displayName,
            displayName: displayName,
          },
          pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
          extensions: {
            prf: {
              eval: {
                first: new Uint8Array(32),
              },
            },
          },
        },
      }) as PublicKeyCredential;

      const prfResult = credential.getClientExtensionResults().prf;
      if (!prfResult || !prfResult.eval.outputs.first) {
        throw new Error('PRF not supported or failed');
      }
      const prfOutput = new Uint8Array(prfResult.eval.outputs.first);
      const kEnc = await deriveKEnc(prfOutput);
      const { publicKey: mlsPk, privateKey: mlsSk } = await generateMlsKeys();
      const userId = deriveUserId(mlsPk);
      const { ciphertext, iv } = await encryptMlsPrivateKey(mlsSk, kEnc, userId);
      const mlsPrivateKeyEnc = btoa(String.fromCharCode(...ciphertext, ...iv));

      const result = await authService.register({
        challengeId,
        userId,
        deviceId,
        displayName,
        mlsPublicKey: btoa(String.fromCharCode(...mlsPk)),
        mlsPrivateKeyEnc,
        webauthnCreateResponse: credential,
      });

      // Store auth token
      localStorage.setItem('authToken', result.authToken.value);
      localStorage.setItem('userProfile', JSON.stringify(result.profile));
      localStorage.setItem('userId', result.profile.userId);
      localStorage.setItem('deviceId', deviceId);

      alert('Registration successful!');
      // TODO: navigate to main app
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Register</h2>
      <input
        type="text"
        placeholder="Display Name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        required
      />
      <button type="submit" disabled={loading}>
        {loading ? 'Registering...' : 'Register'}
      </button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </form>
  );
};

export default RegistrationForm;