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
  deriveMLSPrivateKey,
  deriveKEnc,
  deriveKWasmState,
  sha256,
  encodeBase64Url,
} from '../../utils/crypto';
import { KeyManager } from '../../utils/keyManager';

const NAME_MAX_LENGTH = 64;
import { AuthServiceSupabase } from '../../services/AuthServiceSupabase';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Lock } from 'lucide-react';

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

      // Derive MLS private key deterministically from PRF output via HKDF.
      // The same passkey always produces the same key — no need to store or
      // encrypt the private key on the server.
      const mlsPrivateKey = await deriveMLSPrivateKey(prfOutput);
      const mlsPublicKey = await sha256(mlsPrivateKey); // Mock public key derivation

      // Derive and store kEnc (for any future symmetric encryption) and kWasm.
      const kEnc = await deriveKEnc(prfOutput);
      const kWasm = await deriveKWasmState(prfOutput);

      const webauthnCreateResponse = serializeCreationResult({
        credentialId: createResult.credentialId,
        attestationObject: createResult.attestationObject,
        clientDataJSON: createResult.clientDataJSON,
      });

      // Only send mls_public_key to the server — private key stays on device.
      const { authToken, profile } = await authService.register({
        challengeId,
        userId,
        deviceId,
        mlsPublicKey: encodeBase64Url(mlsPublicKey),
        webauthnCreateResponse,
      });

      // Store keys locally in IndexedDB — private key never leaves this device.
      await keyManager.storeKeys(userId, deviceId, mlsPrivateKey, mlsPublicKey, kEnc);
      await keyManager.storeKWasmState(userId, kWasm);

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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Lock size={14} className="text-white/40" />
        <span className="text-[11px] uppercase tracking-widest text-white/40">Create Account</span>
      </div>
      <Input
        type="text"
        placeholder="Choose a unique name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        required
        className="text-white placeholder:text-white/20"
      />
      <Button type="submit" variant="primary" disabled={loading} className="w-full disabled:opacity-40">
        {loading ? 'Registering...' : 'Register with passkey'}
      </Button>
      {error && (
        <p className="text-[13px] text-red-400/80">{error}</p>
      )}
    </form>
  );
};

export default RegistrationForm;
