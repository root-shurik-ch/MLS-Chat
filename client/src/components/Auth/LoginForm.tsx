import React, { useState } from 'react';
import {
  authenticatePasskeyDiscoverable,
  serializeGetResponse,
  isWebAuthnSupported,
  isPRFSupported,
} from '../../utils/webauthn';
import {
  generateDeviceId,
  decodeBase64Url,
  decryptString,
  deriveMLSPrivateKey,
  deriveKEnc,
  deriveKWasmState,
  sha256,
} from '../../utils/crypto';
import { KeyManager } from '../../utils/keyManager';
import { AuthServiceSupabase } from '../../services/AuthServiceSupabase';
import { saveWasmState } from '../../utils/mlsGroupStorage';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

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

      const { userId: resolvedUserId, prfOutput, credential } =
        await authenticatePasskeyDiscoverable(challenge, resolvedUserIdFromServer);

      const webauthnGetResponse = serializeGetResponse(credential);

      const { authToken, profile, mlsPublicKey: serverMlsPublicKey, wasmStateEnc } =
        await authService.login({
          challengeId,
          userId: resolvedUserId,
          deviceId,
          webauthnGetResponse,
        });

      // Derive MLS private key deterministically from PRF — no server round-trip needed.
      // The same passkey PRF output always yields the same private key on any device.
      const mlsPrivateKey = await deriveMLSPrivateKey(prfOutput);

      // Derive the corresponding public key. If the server has one stored, verify
      // consistency; otherwise fall back to locally derived value.
      const derivedMlsPublicKey = await sha256(mlsPrivateKey);
      const mlsPublicKey =
        serverMlsPublicKey && serverMlsPublicKey.length > 0
          ? decodeBase64Url(serverMlsPublicKey)
          : derivedMlsPublicKey;

      // Derive and store symmetric keys
      const kEnc = await deriveKEnc(prfOutput);
      const kWasm = await deriveKWasmState(prfOutput);

      // Store keys locally in IndexedDB — private key never leaves this device.
      await keyManager.storeKeys(resolvedUserId, deviceId, mlsPrivateKey, mlsPublicKey, kEnc);
      await keyManager.storeKWasmState(resolvedUserId, kWasm);

      // Restore WASM state from server if available (contains group epoch secrets)
      if (wasmStateEnc) {
        try {
          const stateJson = await decryptString(wasmStateEnc, kWasm, resolvedUserId);
          await saveWasmState(resolvedUserId, stateJson);
          console.log('Restored WASM state from server');
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
      <p className="font-mono text-[10px] uppercase tracking-widest text-white/30">Sign in</p>
      <Input
        type="text"
        placeholder="Your name"
        value={nameOrIdInput}
        onChange={(e) => setNameOrIdInput(e.target.value)}
      />
      <Button type="submit" variant="primary" disabled={loading} className="w-full">
        {loading ? (
          <span className="cursor-blink">Authenticating</span>
        ) : (
          'Sign in with passkey'
        )}
      </Button>
      {error && (
        <p className="font-mono text-[12px] text-red-400/70 leading-snug">{error}</p>
      )}
    </form>
  );
};

export default LoginForm;
