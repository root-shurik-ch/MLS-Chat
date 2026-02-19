import React, { useState, useEffect, useRef } from 'react';
import { IncomingMessage, MsgKind } from '../../domain/Message';
import { DeliveryServiceSupabase } from '../../services/DeliveryServiceSupabase';
import { MlsClient, MlsGroup } from '../../mls/index';
import { useToastContext } from '../../contexts/ToastContext';
import InviteLink from '../Group/InviteLink';

interface ChatProps {
  userId: string;
  deviceId: string;
  groupId: string;
  mlsGroup: MlsGroup;
  mlsClient: MlsClient;
  deliveryService: DeliveryServiceSupabase;
  onBack: () => void;
}

interface Message {
  id: string;
  senderId: string;
  deviceId: string;
  text: string;
  timestamp: number;
  serverSeq?: number;
  isSent: boolean;
  isPending?: boolean;
}

const Chat: React.FC<ChatProps> = ({
  userId,
  deviceId,
  groupId,
  mlsGroup,
  mlsClient,
  deliveryService,
  onBack
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [clientSeq, setClientSeq] = useState(1);
  const [showInvite, setShowInvite] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Toast notifications
  const toast = useToastContext();

  // Load message history when opening chat
  useEffect(() => {
    let mounted = true;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) return;

    const loadHistory = async () => {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/get_messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ group_id: groupId, user_id: userId, device_id: deviceId }),
        });
        if (!res.ok) return;
        const { messages: list } = (await res.json()) as { messages?: Array<{
          server_seq: number;
          server_time: number | string;
          sender_id: string;
          device_id: string;
          msg_kind: string;
          mls_bytes: string;
        }> };
        if (!Array.isArray(list) || list.length === 0) return;
        const parsed: Message[] = [];
        for (const m of list) {
          try {
            const plaintext = await mlsClient.decryptMessage(mlsGroup, m.mls_bytes);
            const ts = typeof m.server_time === 'number'
              ? m.server_time
              : new Date(m.server_time as string).getTime();
            parsed.push({
              id: `msg_${m.server_seq}`,
              senderId: m.sender_id,
              deviceId: m.device_id,
              text: plaintext,
              timestamp: ts,
              serverSeq: m.server_seq,
              isSent: m.device_id === deviceId,
            });
          } catch {
            // Skip undecryptable (e.g. from before we joined)
          }
        }
        if (mounted) {
          setMessages(prev => {
            const bySeq = new Map<number, Message>();
            parsed.forEach(p => { if (p.serverSeq != null) bySeq.set(p.serverSeq, p); });
            prev.forEach(m => { if (m.serverSeq != null) bySeq.set(m.serverSeq, m); });
            const pending = prev.filter(m => m.serverSeq == null);
            const all = [...bySeq.values(), ...pending];
            all.sort((a, b) =>
              (a.serverSeq ?? 0) - (b.serverSeq ?? 0) || a.timestamp - b.timestamp
            );
            return all;
          });
        }
      } catch (e) {
        console.error('Failed to load message history:', e);
      }
    };
    loadHistory();
    return () => { mounted = false; };
  }, [groupId, userId, deviceId, mlsGroup, mlsClient]);

  // Subscribe to group and handle incoming messages
  useEffect(() => {
    let mounted = true;

    const setupDelivery = async () => {
      try {
        // Subscribe to this group
        console.log('Subscribing to group:', groupId);
        await deliveryService.subscribe({
          userId,
          deviceId,
          groups: [groupId]
        });

        // Handle incoming messages
        deliveryService.onDeliver(async (msg: IncomingMessage) => {
          if (!mounted) return;

          // Skip our own messages
          if (msg.senderId === userId && msg.deviceId === deviceId) {
            return;
          }

          try {
            // Decrypt MLS message
            console.log('Decrypting message from', msg.senderId);
            const plaintext = await mlsClient.decryptMessage(
              mlsGroup,
              msg.mlsBytes
            );

            // Add to messages
            const newMessage: Message = {
              id: `msg_${msg.serverSeq}`,
              senderId: msg.senderId,
              deviceId: msg.deviceId,
              text: plaintext,
              timestamp: msg.serverTime,
              serverSeq: msg.serverSeq,
              isSent: false,
            };

            setMessages(prev => {
              // Avoid duplicates
              if (prev.some(m => m.serverSeq === msg.serverSeq)) {
                return prev;
              }
              return [...prev, newMessage].sort((a, b) => {
                if (a.serverSeq && b.serverSeq) {
                  return a.serverSeq - b.serverSeq;
                }
                return a.timestamp - b.timestamp;
              });
            });
          } catch (error) {
            console.error('Failed to decrypt message:', error);
          }
        });

        console.log('Delivery setup complete');
      } catch (error) {
        console.error('Failed to setup delivery:', error);
      }
    };

    setupDelivery();

    return () => {
      mounted = false;
    };
  }, [groupId, userId, deviceId, mlsGroup, mlsClient, deliveryService]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const text = input.trim();
    const currentSeq = clientSeq;
    setClientSeq(prev => prev + 1);
    setLoading(true);

    // Add pending message to UI
    const pendingId = `pending_${Date.now()}`;
    const pendingMessage: Message = {
      id: pendingId,
      senderId: userId,
      deviceId: deviceId,
      text,
      timestamp: Date.now(),
      isSent: true,
      isPending: true,
    };

    setMessages(prev => [...prev, pendingMessage]);
    setInput('');

    try {
      // Encrypt with MLS
      console.log('Encrypting message with MLS');
      const mlsBytes = await mlsClient.encryptMessage(mlsGroup, text);

      // Send via WebSocket (use app group id = UUID, not MLS internal groupId)
      console.log('Sending message via WebSocket, seq:', currentSeq);
      await deliveryService.send({
        groupId,
        senderId: userId,
        deviceId: deviceId,
        msgKind: 'chat' as MsgKind,
        mlsBytes: mlsBytes,
        clientSeq: currentSeq,
      });

      // Remove pending flag on success
      setMessages(prev =>
        prev.map(m =>
          m.id === pendingId
            ? { ...m, isPending: false }
            : m
        )
      );

      console.log('Message sent successfully');
    } catch (error) {
      console.error('Failed to send message:', error);

      // Mark as failed
      setMessages(prev =>
        prev.map(m =>
          m.id === pendingId
            ? { ...m, isPending: false, text: `❌ ${m.text} (Failed to send)` }
            : m
        )
      );

      toast.error('Failed to send message. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 15px',
        borderBottom: '1px solid #ccc',
        background: '#fff'
      }}>
        <button onClick={onBack} style={{ padding: '5px 10px' }}>
          ← Back
        </button>
        <h2 style={{ margin: 0, fontSize: 18 }}>
          Group Chat
        </h2>
        <button
          onClick={() => setShowInvite(!showInvite)}
          style={{
            marginLeft: 'auto',
            padding: '5px 12px',
            background: showInvite ? '#6c757d' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          {showInvite ? 'Hide Invite' : '+ Invite'}
        </button>
        <span style={{ fontSize: 12, color: '#666' }}>
          {groupId.substring(0, 8)}...
        </span>
      </div>

      {/* Invite section */}
      {showInvite && (
        <div style={{ padding: '15px', borderBottom: '1px solid #e0e0e0', background: '#f9f9f9' }}>
          <InviteLink
            groupId={groupId}
            mlsGroup={mlsGroup}
            mlsClient={mlsClient}
            onInviteGenerated={(welcome) => {
              console.log('Welcome message generated:', welcome.substring(0, 50) + '...');
            }}
          />
        </div>
      )}

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: 15,
        background: '#f5f5f5',
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }}>
        {messages.length === 0 ? (
          <div style={{
            textAlign: 'center',
            color: '#999',
            marginTop: 50
          }}>
            <p>No messages yet</p>
            <p style={{ fontSize: 14 }}>
              Start the conversation! 🚀
            </p>
          </div>
        ) : (
          messages.map(msg => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                justifyContent: msg.isSent ? 'flex-end' : 'flex-start',
              }}
            >
              <div
                style={{
                  maxWidth: '70%',
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: msg.isSent ? '#007bff' : '#fff',
                  color: msg.isSent ? '#fff' : '#000',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                  opacity: msg.isPending ? 0.6 : 1,
                }}
              >
                {!msg.isSent && (
                  <div style={{
                    fontSize: 11,
                    color: '#666',
                    marginBottom: 4,
                    fontWeight: 600
                  }}>
                    {msg.senderId === userId ? 'You' : msg.senderId.substring(0, 8)}
                  </div>
                )}
                <div style={{ wordBreak: 'break-word' }}>
                  {msg.text}
                </div>
                <div style={{
                  fontSize: 10,
                  marginTop: 4,
                  opacity: 0.7,
                  textAlign: 'right'
                }}>
                  {formatTime(msg.timestamp)}
                  {msg.isPending && ' • Sending...'}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: 15,
        borderTop: '1px solid #ccc',
        background: '#fff'
      }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            type="text"
            name="message"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            style={{
              flex: 1,
              padding: '10px 14px',
              border: '1px solid #ccc',
              borderRadius: 20,
              fontSize: 14,
              outline: 'none'
            }}
            onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            style={{
              padding: '10px 20px',
              background: loading || !input.trim() ? '#ccc' : '#007bff',
              color: '#fff',
              border: 'none',
              borderRadius: 20,
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 600
            }}
          >
            {loading ? 'Sending...' : 'Send'}
          </button>
        </div>
        <div style={{
          fontSize: 11,
          color: '#666',
          marginTop: 8,
          textAlign: 'center'
        }}>
          🔒 End-to-end encrypted with MLS
        </div>
      </div>
    </div>
  );
};

export default Chat;
