import React, { useState } from 'react';
import {
  authenticatePasskeyDiscoverable,
  serializeGetResponse,
  isWebAuthnSupported,
  isPRFSupported,
} from '../../utils/webauthn';
import { generateDeviceId, decodeBase64Url, decryptString } from '../../utils/crypto';
import { KeyManager } from '../../utils/keyManager';
import { AuthServiceSupabase } from '../../services/AuthServiceSupabase';
import { saveWasmState } from '../../utils/mlsGroupStorage';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Lock } from 'lucide-react';

interface LoginFormProps {
  onSuccess: (userId: string, deviceId: string) => void;
}

const LoginForm: React.FC<LoginFormProps> = ({ onSuccess }) => {
  const [nameOrIdInput, setNameOrIdInput] = useState('');
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

      const nameOrId = nameOrIdInput.trim();
      if (!nameOrId) {
        setError('Enter your name to sign in');
        return;
      }

      const deviceId = localStorage.getItem('deviceId') || generateDeviceId();
      const authService = new AuthServiceSupabase(baseUrl);
      const keyManager = new KeyManager();
      await keyManager.init();

      const { challengeId, challenge, userId: resolvedUserIdFromServer } =
        await authService.getChallenge('login', nameOrId);

      if (!resolvedUserIdFromServer) {
        setError('User not found. Enter your name or User ID.');
        return;
      }

      const { userId: resolvedUserId, credentialId, prfOutput, credential } =
        await authenticatePasskeyDiscoverable(challenge, resolvedUserIdFromServer);

      const webauthnGetResponse = serializeGetResponse(credential);

      const { authToken, profile, mlsPublicKey, mlsPrivateKeyEnc, wasmStateEnc } =
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

      if (wasmStateEnc) {
        try {
          const kWasm = await keyManager.getKWasmState(resolvedUserId);
          if (kWasm) {
            const stateJson = await decryptString(wasmStateEnc, kWasm, resolvedUserId);
            await saveWasmState(resolvedUserId, stateJson);
            console.log('Restored WASM state from server');
          }
        } catch (e) {
          console.warn('Failed to restore WASM state from server:', e);
        }
      }

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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Lock size={14} className="text-white/40" />
        <span className="text-[11px] uppercase tracking-widest text-white/40">Sign In</span>
      </div>
      <Input
        type="text"
        placeholder="Your name"
        value={nameOrIdInput}
        onChange={(e) => setNameOrIdInput(e.target.value)}
        className="text-white placeholder:text-white/20"
      />
      <Button type="submit" variant="primary" disabled={loading} className="w-full disabled:opacity-40">
        {loading ? 'Signing in...' : 'Sign in with passkey'}
      </Button>
      {error && (
        <p className="text-[13px] text-red-400/80">{error}</p>
      )}
    </form>
  );
};

export default LoginForm;
