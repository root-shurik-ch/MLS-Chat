import React, { useState } from 'react';
import { GroupManager } from '../../mls/group';
import { MlsClient } from '../../mls/index';
import { GroupMeta } from '../../domain/Group';
import { IndexedDBStorage } from '../../utils/storage';

const CreateGroupForm: React.FC = () => {
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      const groupMeta: GroupMeta = {
        groupId,
        name,
        avatarUrl: avatarUrl || undefined,
        dsUrl: 'wss://your-ds-url', // TODO: configure
        currentEpoch: 0,
      };

      // Store group metadata in IndexedDB
      const groupStorage = new IndexedDBStorage('mls-groups', 'groups');
      await groupStorage.init();
      await groupStorage.set(groupId, groupMeta);

      alert('Group created!');
      // TODO: navigate or refresh
      window.location.reload(); // simple refresh
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create group');
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