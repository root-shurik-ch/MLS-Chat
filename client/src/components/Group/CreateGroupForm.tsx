import React, { useState } from 'react';
import { GroupManager } from '../../mls/group';
import { MlsClient } from '../../mls/index';
import { GroupMeta } from '../../domain/Group';
import { IndexedDBStorage } from '../../utils/storage';
import { useToastContext } from '../../contexts/ToastContext';

const CreateGroupForm: React.FC = () => {
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Toast notifications
  const toast = useToastContext();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const groupId = crypto.randomUUID();
      const userId = localStorage.getItem('userId')!;
      const deviceId = localStorage.getItem('deviceId')!;

      // Load MLS keys from secure IndexedDB storage
      const keyStorage = new IndexedDBStorage('mls-keys', 'keys');
      await keyStorage.init();
      
      const mlsPrivateKeyStr = await keyStorage.get(`mlsPrivateKey_${userId}_${deviceId}`);
      const mlsPublicKeyStr = await keyStorage.get(`mlsPublicKey_${userId}_${deviceId}`);
      
      if (!mlsPrivateKeyStr || !mlsPublicKeyStr) {
        throw new Error('MLS keys not found. Please log in again.');
      }

      const mlsPrivateKey = Uint8Array.from(atob(mlsPrivateKeyStr), c => c.charCodeAt(0));
      const mlsPublicKey = Uint8Array.from(atob(mlsPublicKeyStr), c => c.charCodeAt(0));
      
      const mlsClient = new MlsClient(mlsPrivateKey, mlsPublicKey);
      const groupManager = new GroupManager(mlsClient);
      await groupManager.createGroup(groupId);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl) {
        throw new Error('VITE_SUPABASE_URL is not set');
      }
      const dsUrl = import.meta.env.VITE_WS_URL || (() => {
        const u = new URL(supabaseUrl);
        return (u.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + u.host + '/functions/v1/ds_send';
      })();
      const res = await fetch(`${supabaseUrl}/functions/v1/group_create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group_id: groupId,
          name,
          avatar_url: avatarUrl || undefined,
          user_id: userId,
          device_id: deviceId,
          ds_url: dsUrl,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Failed to create group on server');
      }

      const groupMeta: GroupMeta = {
        groupId,
        name,
        avatarUrl: avatarUrl || undefined,
        dsUrl,
        currentEpoch: 0,
      };

      const groupStorage = new IndexedDBStorage('mls-groups', 'groups');
      await groupStorage.init();
      await groupStorage.set(groupId, groupMeta);

      toast.success('Group created successfully!');
      window.location.reload();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create group';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Create Group</h2>
      <input
        type="text"
        placeholder="Group Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        type="url"
        placeholder="Avatar URL (optional)"
        value={avatarUrl}
        onChange={(e) => setAvatarUrl(e.target.value)}
      />
      <button type="submit" disabled={loading}>
        {loading ? 'Creating...' : 'Create Group'}
      </button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </form>
  );
};

export default CreateGroupForm;