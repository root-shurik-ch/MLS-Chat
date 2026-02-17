import React, { useState } from 'react';
import { GroupManager } from '../../mls/group';
import { MlsClient } from '../../mls/index';
import { AuthServiceSupabase } from '../../services/AuthServiceSupabase';
import { DeliveryServiceSupabase } from '../../services/DeliveryServiceSupabase';

const InviteMemberForm: React.FC<{ groupId: string }> = ({ groupId }) => {
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const deviceId = localStorage.getItem('deviceId')!;
      const authService = new AuthServiceSupabase('https://your-supabase-url.supabase.co/functions/v1');
      const keyPackage = await authService.getKeyPackage(userId, deviceId);

      const mlsPrivateKeyStr = localStorage.getItem('mlsPrivateKey')!;
      const mlsPrivateKey = Uint8Array.from(atob(mlsPrivateKeyStr), c => c.charCodeAt(0));
      const mlsPublicKeyStr = localStorage.getItem('mlsPublicKey')!;
      const mlsPublicKey = Uint8Array.from(atob(mlsPublicKeyStr), c => c.charCodeAt(0));
      const mlsClient = new MlsClient(mlsPrivateKey, mlsPublicKey);
      const groupManager = new GroupManager(mlsClient);

      const mlsBytes = await groupManager.addMember(groupId, keyPackage);

      const deliveryService = new DeliveryServiceSupabase();
      const authToken = { value: localStorage.getItem('authToken')! };
      await deliveryService.connect('wss://your-ds-url', authToken);
      await deliveryService.send({
        groupId,
        senderId: localStorage.getItem('userId')!,
        deviceId,
        msgKind: 'handshake',
        mlsBytes,
        clientSeq: Date.now(), // simple seq
      });

      alert('Member invited!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite member');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h3>Invite Member to Group {groupId}</h3>
      <input
        type="text"
        placeholder="User ID"
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        required
      />
      <button type="submit" disabled={loading}>
        {loading ? 'Inviting...' : 'Invite'}
      </button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </form>
  );
};

export default InviteMemberForm;