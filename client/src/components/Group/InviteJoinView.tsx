// InviteJoinView — shown full-screen after login when ?join=<invite_id> is in the URL.
// Handles the joiner side of the new link-based invite flow.
import React, { useState, useEffect, useRef } from 'react';
import { MlsClient } from '../../mls/index';
import { useToastContext } from '../../contexts/ToastContext';
import { saveMlsGroup } from '../../utils/mlsGroupStorage';
import { saveAndSyncWasmState } from '../../utils/wasmStateSync';
import { Button } from '../ui/Button';
import { Lock } from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'apikey': ANON_KEY,
    'Authorization': `Bearer ${localStorage.getItem('authToken') ?? ANON_KEY}`,
  };
}

interface InviteJoinViewProps {
  inviteId: string;
  userId: string;
  deviceId: string;
  mlsClient: MlsClient;
  onSuccess: (groupId: string) => void;
}

type Step = 'loading' | 'ready' | 'joining' | 'waiting' | 'done' | 'error';

export const InviteJoinView: React.FC<InviteJoinViewProps> = ({
  inviteId,
  userId,
  deviceId,
  mlsClient,
  onSuccess,
}) => {
  const [step, setStep] = useState<Step>('loading');
  const [groupName, setGroupName] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toast = useToastContext();

  // Load invite info on mount
  useEffect(() => {
    if (!SUPABASE_URL) {
      setErrorMsg('Configuration error: SUPABASE_URL is not set.');
      setStep('error');
      return;
    }

    fetch(`${SUPABASE_URL}/functions/v1/invite_info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
      body: JSON.stringify({ invite_id: inviteId }),
    })
      .then(r => r.json())
      .then((data: { group_name?: string; status?: string; expired?: boolean; error?: string }) => {
        if (data.error) { setErrorMsg(data.error); setStep('error'); return; }
        if (data.expired) { setErrorMsg('This invite link has expired.'); setStep('error'); return; }
        if (data.status === 'complete') { setErrorMsg('This invite has already been used.'); setStep('error'); return; }
        setGroupName(data.group_name ?? 'a group');
        setStep('ready');
      })
      .catch(() => {
        setErrorMsg('Failed to load invite info. Check your connection.');
        setStep('error');
      });
  }, [inviteId]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  const handleJoin = async () => {
    if (!SUPABASE_URL) return;
    setStep('joining');

    try {
      const kp = await mlsClient.generateKeyPackage();

      const joinRes = await fetch(`${SUPABASE_URL}/functions/v1/invite_join`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          invite_id: inviteId,
          user_id: userId,
          device_id: deviceId,
          kp_hex: kp.data,
        }),
      });
      const joinData = await joinRes.json() as { ok?: boolean; error?: string };
      if (!joinData.ok) throw new Error(joinData.error ?? 'Failed to submit join request');

      setStep('waiting');

      // Poll for welcome every 3 seconds
      pollingRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`${SUPABASE_URL}/functions/v1/invite_poll`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ invite_id: inviteId, user_id: userId, device_id: deviceId }),
          });
          const pollData = await pollRes.json() as {
            status?: string;
            welcome_hex?: string;
            group_id?: string;
            error?: string;
          };

          if (pollData.status === 'complete' && pollData.welcome_hex && pollData.group_id) {
            if (pollingRef.current) clearInterval(pollingRef.current);

            const mlsGroup = await mlsClient.processWelcome(pollData.welcome_hex);
            const serverGroupId = pollData.group_id;

            const groupJoinRes = await fetch(`${SUPABASE_URL}/functions/v1/group_join`, {
              method: 'POST',
              headers: authHeaders(),
              body: JSON.stringify({ group_id: serverGroupId, user_id: userId, device_id: deviceId }),
            });
            if (!groupJoinRes.ok) {
              const err = await groupJoinRes.json().catch(() => ({})) as { error?: string };
              throw new Error(err.error ?? 'Failed to register as group member');
            }

            await saveMlsGroup({ ...mlsGroup, id: serverGroupId, groupId: mlsGroup.groupId });
            const stateJson = await mlsClient.exportState();
            await saveAndSyncWasmState(userId, deviceId, stateJson);

            setStep('done');
            toast.success('Joined group!');
            onSuccess(serverGroupId);
          }
        } catch (e) {
          console.warn('[InviteJoinView] poll error:', e);
        }
      }, 3000);
    } catch (e) {
      console.error('[InviteJoinView] join error:', e);
      setErrorMsg(e instanceof Error ? e.message : 'Failed to join. Please try again.');
      setStep('error');
    }
  };

  return (
    <div className="w-full max-w-xs space-y-10 animate-fade-up">
      {/* Wordmark */}
      <div className="flex items-center gap-2">
        <Lock size={11} className="text-white/25" />
        <span className="font-mono text-[10px] text-white/25 uppercase tracking-widest">minimum.chat</span>
      </div>

      {/* Loading */}
      {step === 'loading' && (
        <div className="flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/20 animate-pulse" />
          <span className="font-mono text-[11px] text-white/25 uppercase tracking-widest">Loading…</span>
        </div>
      )}

      {/* Error */}
      {step === 'error' && (
        <div className="space-y-3">
          <p className="text-[15px] font-medium text-white/60">Invite unavailable</p>
          <p className="text-[13px] text-white/35 leading-relaxed">{errorMsg}</p>
        </div>
      )}

      {/* Ready → Joining → Waiting */}
      {(step === 'ready' || step === 'joining' || step === 'waiting') && (
        <div className="space-y-8">
          <div className="space-y-2">
            <p className="font-mono text-[10px] text-white/25 uppercase tracking-widest">Group invite</p>
            <h1 className="text-[26px] font-semibold tracking-tight leading-tight">
              {groupName}
            </h1>
            <p className="text-[13px] text-white/30 leading-relaxed">
              End-to-end encrypted. Keys stay on your device.
            </p>
          </div>

          {step === 'ready' && (
            <Button variant="primary" onClick={handleJoin} className="w-full py-3">
              Join Group
            </Button>
          )}

          {step === 'joining' && (
            <div className="flex items-center gap-2.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" />
              <span className="font-mono text-[11px] text-white/35 uppercase tracking-widest">
                Generating keys…
              </span>
            </div>
          )}

          {step === 'waiting' && (
            <div className="space-y-5">
              <div className="flex items-center gap-2.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" />
                <span className="font-mono text-[11px] text-white/35 uppercase tracking-widest">
                  Waiting for admin…
                </span>
              </div>
              <p className="text-[12px] text-white/20 leading-relaxed">
                Your request was sent. The admin's app will process it automatically — this usually takes a few seconds.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default InviteJoinView;
