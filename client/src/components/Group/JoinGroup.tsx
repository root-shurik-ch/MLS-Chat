// Component for joining a group using a Welcome message
import React, { useState } from 'react';
import { MlsClient } from '../../mls/index';
import { useToastContext } from '../../contexts/ToastContext';
import { saveMlsGroup } from '../../utils/mlsGroupStorage';

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
  const [welcomeCode, setWelcomeCode] = useState('');
  const [loading, setLoading] = useState(false);
  const toast = useToastContext();

  const handleJoin = async () => {
    if (!welcomeCode.trim()) {
      toast.warning('Please enter an invitation code');
      return;
    }

    const parsed = parseInviteCode(welcomeCode);
    if (!parsed) {
      toast.error('Invalid invitation format. Paste the full code shared by the inviter (must include group id).');
      return;
    }

    const { groupId: serverGroupId, welcome } = parsed;
    const userId = localStorage.getItem('userId');
    const deviceId = localStorage.getItem('deviceId');
    if (!userId || !deviceId) {
      toast.error('Not logged in. Please log in first.');
      return;
    }

    try {
      setLoading(true);

      const keyPackage = await mlsClient.generateKeyPackage();
      console.log('Processing Welcome message...');
      const mlsGroup = await mlsClient.processWelcome(welcome, keyPackage.ref);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl) {
        throw new Error('VITE_SUPABASE_URL is not set');
      }
      const joinRes = await fetch(`${supabaseUrl}/functions/v1/group_join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group_id: serverGroupId,
          user_id: userId,
          device_id: deviceId,
        }),
      });
      if (!joinRes.ok) {
        const err = await joinRes.json().catch(() => ({ error: joinRes.statusText }));
        throw new Error(err.error || 'Failed to register as group member');
      }

      await saveMlsGroup({ ...mlsGroup, groupId: serverGroupId });

      toast.success('Successfully joined group!');
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
    <div style={{
      padding: '20px',
      border: '1px solid #e0e0e0',
      borderRadius: '8px',
      marginBottom: '20px'
    }}>
      <h3 style={{ marginTop: 0 }}>Join Group</h3>
      <p style={{ fontSize: '14px', color: '#666' }}>
        Enter the invitation code someone shared with you
      </p>

      <textarea
        value={welcomeCode}
        onChange={(e) => setWelcomeCode(e.target.value)}
        placeholder="Paste invitation code here..."
        style={{
          width: '100%',
          minHeight: '120px',
          padding: '10px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          fontSize: '12px',
          fontFamily: 'monospace',
          marginBottom: '10px',
          resize: 'vertical',
        }}
      />

      <button
        onClick={handleJoin}
        disabled={loading || !welcomeCode.trim()}
        style={{
          padding: '10px 20px',
          background: loading || !welcomeCode.trim() ? '#ccc' : '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: loading || !welcomeCode.trim() ? 'not-allowed' : 'pointer',
          fontSize: '14px',
          fontWeight: 600,
          width: '100%',
        }}
      >
        {loading ? 'Joining...' : 'Join Group'}
      </button>
    </div>
  );
};

export default JoinGroup;
