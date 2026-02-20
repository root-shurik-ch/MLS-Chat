// Component for generating group invitation (Welcome message)
// New flow: JOINER generates KP → INVITER uses it here → shows Welcome for joiner
import React, { useState } from 'react';
import { MlsClient, MlsGroup, KeyPackage } from '../../mls/index';
import { useToastContext } from '../../contexts/ToastContext';
import { saveAndSyncWasmState } from '../../utils/wasmStateSync';
import { Button } from '../ui/Button';

interface InviteLinkProps {
  groupId: string;
  mlsGroup: MlsGroup;
  mlsClient: MlsClient;
  onInviteGenerated?: (welcomeMessage: string) => void;
}

export const InviteLink: React.FC<InviteLinkProps> = ({
  groupId,
  mlsGroup,
  mlsClient,
  onInviteGenerated
}) => {
  const [loading, setLoading] = useState(false);
  const [joinerKpHex, setJoinerKpHex] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const toast = useToastContext();

  const handleGenerateWelcome = async () => {
    const kpHex = joinerKpHex.trim();
    if (!kpHex) {
      toast.warning('Paste the invite request code from the joiner first.');
      return;
    }

    try {
      setLoading(true);

      const keyPackage: KeyPackage = {
        data: kpHex,
        signature: '',
        hpkePublicKey: '',
        credential: '',
        extensions: {},
      };

      const result = await mlsClient.addMember(mlsGroup, keyPackage);

      if (!result.welcome) {
        throw new Error('Welcome message not generated');
      }

      const payload = JSON.stringify({ groupId, welcome: result.welcome });
      setWelcomeMessage(payload);
      onInviteGenerated?.(payload);

      // Persist WASM state (epoch advanced after add_member)
      const userId = localStorage.getItem('userId');
      const deviceId = localStorage.getItem('deviceId');
      if (userId && deviceId) {
        try {
          const stateJson = await mlsClient.exportState();
          await saveAndSyncWasmState(userId, deviceId, stateJson);
        } catch (e) {
          console.warn('Failed to save WASM state after generating welcome:', e);
        }
      }

      toast.success('Welcome generated! Share the code with the joiner.');
    } catch (error) {
      console.error('Failed to generate welcome:', error);
      toast.error('Failed to generate welcome. Check the invite request code and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!welcomeMessage) return;
    await navigator.clipboard.writeText(welcomeMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Welcome code copied!');
  };

  const handleReset = () => {
    setWelcomeMessage(null);
    setJoinerKpHex('');
    setCopied(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[13px] text-white/40 uppercase tracking-widest mb-3">Add Member</p>
        <p className="text-sm text-white/60 mb-4">
          Ask the person joining to generate an invite request, then paste their code below.
        </p>
      </div>

      {!welcomeMessage ? (
        <div className="space-y-3">
          <textarea
            value={joinerKpHex}
            onChange={(e) => setJoinerKpHex(e.target.value)}
            placeholder="Paste joiner's invite request code here..."
            className="w-full min-h-[100px] bg-transparent border border-white/10 focus:border-white/40 px-3 py-2 outline-none transition-all font-mono text-[12px] text-white/70 placeholder:text-white/20 resize-none"
          />
          <Button
            variant="primary"
            onClick={handleGenerateWelcome}
            disabled={loading || !joinerKpHex.trim()}
            className="disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {loading ? 'Generating...' : 'Generate Welcome'}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="border border-white/10 p-3 font-mono text-[11px] text-white/50 max-h-[120px] overflow-y-auto break-all">
            {welcomeMessage}
          </div>
          <div className="flex gap-3">
            <Button variant="primary" onClick={handleCopy}>
              {copied ? 'Copied!' : 'Copy Welcome Code'}
            </Button>
            <Button variant="ghost" onClick={handleReset}>
              Add Another
            </Button>
          </div>
          <p className="text-[11px] text-white/30">
            Share this code with the joiner. They paste it to complete joining.
          </p>
        </div>
      )}
    </div>
  );
};

export default InviteLink;
