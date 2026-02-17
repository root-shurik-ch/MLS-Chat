import React, { useState, useEffect } from 'react';
import { IncomingMessage } from '../../domain/Message';
import { GroupManager } from '../../mls/group';
import { MlsClient } from '../../mls';
import { DeliveryService } from '../../services/DeliveryService';
import { DeliveryServiceSupabase } from '../../services/DeliveryServiceSupabase';
import { GroupMeta } from '../../domain/Group';

interface ChatProps {
  groupMeta: GroupMeta;
}

interface DecryptedMessage extends IncomingMessage {
  plaintext: string;
}

const Chat: React.FC<ChatProps> = ({ groupMeta }) => {
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [groupManager, setGroupManager] = useState<GroupManager | null>(null);
  const [deliveryService, setDeliveryService] = useState<DeliveryService | null>(null);
  const [clientSeq, setClientSeq] = useState(0);

  useEffect(() => {
    // Init MLS
    const mlsPrivateKeyStr = localStorage.getItem('mlsPrivateKey')!;
    const mlsPrivateKey = Uint8Array.from(atob(mlsPrivateKeyStr), c => c.charCodeAt(0));
    const mlsPublicKeyStr = localStorage.getItem('mlsPublicKey')!;
    const mlsPublicKey = Uint8Array.from(atob(mlsPublicKeyStr), c => c.charCodeAt(0));
    const mlsClient = new MlsClient(mlsPrivateKey, mlsPublicKey);
    const gm = new GroupManager(mlsClient);
    // Note: In real implementation, load group state from storage
    gm.createGroup(groupMeta.groupId); // Placeholder, assumes group is recreated
    setGroupManager(gm);

    // Init DeliveryService
    const ds = new DeliveryServiceSupabase();
    const authToken = { value: localStorage.getItem('authToken')!, expiresAt: Date.now() + 3600000 }; // Dummy expiration
    ds.connect(groupMeta.dsUrl, authToken).then(() => {
      ds.subscribe({
        userId: localStorage.getItem('userId')!,
        deviceId: localStorage.getItem('deviceId')!,
        groups: [groupMeta.groupId],
      });
      ds.onDeliver(async (msg: IncomingMessage) => {
        if (msg.groupId === groupMeta.groupId) {
          const plaintext = await gm.receiveMessage(groupMeta.groupId, msg.mlsBytes);
          const decrypted: DecryptedMessage = { ...msg, plaintext };
          setMessages(prev => [...prev, decrypted]);
        }
      });
    });
    setDeliveryService(ds);

    return () => {
      ds.disconnect();
    };
  }, [groupMeta]);

  const handleSend = async () => {
    if (!groupManager || !deliveryService || !input.trim()) return;
    setLoading(true);
    try {
      const mlsBytes = await groupManager.sendMessage(groupMeta.groupId, input);
      await deliveryService.send({
        groupId: groupMeta.groupId,
        senderId: localStorage.getItem('userId')!,
        deviceId: localStorage.getItem('deviceId')!,
        msgKind: 'chat',
        mlsBytes,
        clientSeq,
      });
      setClientSeq(prev => prev + 1);
      setInput('');
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ height: '400px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #ccc', padding: '10px' }}>
        {messages.map((msg, index) => (
          <div key={index} style={{ marginBottom: '10px' }}>
            <strong>{msg.senderId}:</strong> {msg.plaintext}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', padding: '10px' }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          style={{ flex: 1, marginRight: '10px' }}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
        />
        <button onClick={handleSend} disabled={loading}>
          {loading ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
};

export default Chat;