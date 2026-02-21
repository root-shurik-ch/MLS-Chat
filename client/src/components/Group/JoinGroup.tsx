// Two-step join flow:
// Step 1: JOINER generates invite request (KP hex) to share with group admin
// Step 2: JOINER pastes Welcome code from admin → joins group
import React, { useState } from 'react';
import { MlsClient } from '../../mls/index';
import { useToastContext } from '../../contexts/ToastContext';
import { saveMlsGroup } from '../../utils/mlsGroupStorage';
import { saveAndSyncWasmState } from '../../utils/wasmStateSync';
import { Button } from '../ui/Button';

interface JoinGroupProps {
  mlsClient: MlsClient;
  onJoinSuccess: (groupId: string) => void;
}

function parseInviteCode(input: string): { groupId: string; welcome: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const data = JSON.parse(trimmed) as { groupId?: string; welcome?: string };
    if (typeof data.groupId === 'string' && typeof data.welcome === 'string') {
      return { groupId: data.groupId, welcome: data.welcome };
    }
  } catch {
    // not JSON
  }
  return null;
}

export const JoinGroup: React.FC<JoinGroupProps> = ({ mlsClient, onJoinSuccess }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [kpHex, setKpHex] = useState<string | null>(null);
  const [kpCopied, setKpCopied] = useState(false);
  const [welcomeCode, setWelcomeCode] = useState('');
  const [loading, setLoading] = useState(false);
  const toast = useToastContext();

  // Step 1: Generate invite request (KP) for joiner to share with admin
  const handleGenerateKP = async () => {
    try {
      setLoading(true);
      const kp = await mlsClient.generateKeyPackage();
      setKpHex(kp.data);
      setStep(2);
    } catch (error) {
      console.error('Failed to generate invite request:', error);
      toast.error('Failed to generate invite request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyKP = async () => {
    if (!kpHex) return;
    await navigator.clipboard.writeText(kpHex);
    setKpCopied(true);
    setTimeout(() => setKpCopied(false), 2000);
    toast.success('Invite request copied!');
  };

  // Step 2: Process Welcome from admin
  const handleJoin = async () => {
    if (!welcomeCode.trim()) {
      toast.warning('Paste the welcome code from the group admin.');
      return;
    }

    const parsed = parseInviteCode(welcomeCode);
    if (!parsed) {
      toast.error('Invalid welcome format. Paste the full code shared by the admin.');
      return;
    }

    const { groupId: serverGroupId, welcome: welcomeRaw } = parsed;
    // Strip any whitespace that may have crept in during copy-paste
    const welcome = welcomeRaw.replace(/\s+/g, '');
    if (!/^[0-9a-fA-F]+$/.test(welcome)) {
      toast.error('Invalid welcome code — the welcome field must be a hex string.');
      return;
    }
    const userId = localStorage.getItem('userId');
    const deviceId = localStorage.getItem('deviceId');
    if (!userId || !deviceId) {
      toast.error('Not logged in. Please log in first.');
      return;
    }

    try {
      setLoading(true);

      // KP was already generated in step 1 and stored in WASM backend
      const mlsGroup = await mlsClient.processWelcome(welcome);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl) throw new Error('VITE_SUPABASE_URL is not set');

      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
      const joinRes = await fetch(`${supabaseUrl}/functions/v1/group_join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
          'Authorization': `Bearer ${localStorage.getItem('authToken') ?? anonKey}`,
        },
        body: JSON.stringify({ group_id: serverGroupId, user_id: userId, device_id: deviceId }),
      });
      if (!joinRes.ok) {
        const err = await joinRes.json().catch(() => ({ error: joinRes.statusText }));
        throw new Error(err.error || 'Failed to register as group member');
      }

      await saveMlsGroup({ ...mlsGroup, id: serverGroupId, groupId: mlsGroup.groupId });

      try {
        const stateJson = await mlsClient.exportState();
        await saveAndSyncWasmState(userId, deviceId, stateJson);
      } catch (e) {
        console.warn('Failed to save WASM state after joining group:', e);
      }

      toast.success('Joined group!');
      setWelcomeCode('');
      onJoinSuccess(serverGroupId);
    } catch (error) {
      console.error('Failed to join group:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to join group. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Step 1 */}
      <div className={step === 1 ? '' : 'opacity-50'}>
        <p className="text-[13px] text-white/40 uppercase tracking-widest mb-3">
          Step 1 — Generate Invite Request
        </p>
        {!kpHex ? (
          <div className="space-y-3">
            <p className="text-sm text-white/60">
              Generate a one-time invite request code to share with the group admin.
            </p>
            <Button
              variant="primary"
              onClick={handleGenerateKP}
              disabled={loading || step !== 1}
              className="disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {loading && step === 1 ? 'Generating...' : 'Generate Invite Request'}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-white/60">Share this code with the group admin:</p>
            <div className="border border-white/10 p-3 font-mono text-[11px] text-white/50 max-h-[100px] overflow-y-auto break-all">
              {kpHex}
            </div>
            <Button variant="ghost" onClick={handleCopyKP}>
              {kpCopied ? 'Copied!' : 'Copy Invite Request'}
            </Button>
          </div>
        )}
      </div>

      {/* Step 2 */}
      {kpHex && (
        <div>
          <p className="text-[13px] text-white/40 uppercase tracking-widest mb-3">
            Step 2 — Paste Welcome Code
          </p>
          <div className="space-y-3">
            <p className="text-sm text-white/60">
              Once the admin processes your request, paste their welcome code here.
            </p>
            <textarea
              value={welcomeCode}
              onChange={(e) => setWelcomeCode(e.target.value)}
              placeholder="Paste welcome code from admin..."
              className="w-full min-h-[100px] bg-transparent border border-white/10 focus:border-white/40 px-3 py-2 outline-none transition-all font-mono text-[12px] text-white/70 placeholder:text-white/20 resize-none"
            />
            <Button
              variant="primary"
              onClick={handleJoin}
              disabled={loading || !welcomeCode.trim()}
              className="w-full disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {loading ? 'Joining...' : 'Join Group'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default JoinGroup;
