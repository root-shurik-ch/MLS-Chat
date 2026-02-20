import React, { useState } from 'react';
import { MlsClient } from '../../mls/index';
import { GroupMeta } from '../../domain/Group';
import { IndexedDBStorage } from '../../utils/storage';
import { saveMlsGroup } from '../../utils/mlsGroupStorage';
import { saveAndSyncWasmState } from '../../utils/wasmStateSync';
import { useToastContext } from '../../contexts/ToastContext';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface CreateGroupFormProps {
  mlsClient: MlsClient | null;
  onSuccess?: () => void;
}

const CreateGroupForm: React.FC<CreateGroupFormProps> = ({ mlsClient, onSuccess }) => {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toast = useToastContext();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mlsClient) {
      toast.error('Not ready. Please wait and try again.');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const groupId = crypto.randomUUID();
      const userId = localStorage.getItem('userId')!;
      const deviceId = localStorage.getItem('deviceId')!;

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl) throw new Error('VITE_SUPABASE_URL is not set');

      const dsUrl = import.meta.env.VITE_WS_URL || (() => {
        const u = new URL(supabaseUrl);
        return (u.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + u.host + '/functions/v1/ds_send';
      })();

      // Create MLS group in the shared WASM backend
      const mlsGroup = await mlsClient.createGroup(groupId);

      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
      const res = await fetch(`${supabaseUrl}/functions/v1/group_create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
          'Authorization': `Bearer ${localStorage.getItem('authToken') ?? anonKey}`,
        },
        body: JSON.stringify({
          group_id: groupId,
          name,
          avatar_url: undefined,
          user_id: userId,
          device_id: deviceId,
          ds_url: dsUrl,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Failed to create group on server');
      }

      // Save group meta for display in group list
      const groupMeta: GroupMeta = { groupId, name, dsUrl, currentEpoch: 0 };
      const groupStorage = new IndexedDBStorage('mls-groups', 'groups');
      await groupStorage.init();
      await groupStorage.set(groupId, groupMeta);

      // Save MLS group to MlsChatGroups/groups so handleSelectGroup can find it
      await saveMlsGroup(mlsGroup);

      // Persist WASM state so the group survives page reload
      try {
        const stateJson = await mlsClient.exportState();
        await saveAndSyncWasmState(userId, deviceId, stateJson);
      } catch (e) {
        console.warn('Failed to save WASM state after group creation:', e);
      }

      toast.success('Group created!');
      setName('');
      onSuccess?.();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create group';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-[11px] uppercase tracking-widest text-white/40">New Group</p>
      <Input
        type="text"
        placeholder="Group name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        className="text-white placeholder:text-white/20"
      />
      <Button type="submit" variant="primary" disabled={loading} className="w-full disabled:opacity-40">
        {loading ? 'Creating...' : 'Create Group'}
      </Button>
      {error && <p className="text-[13px] text-red-400/80">{error}</p>}
    </form>
  );
};

export default CreateGroupForm;
