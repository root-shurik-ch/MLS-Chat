import React, { useState, useEffect, useRef } from 'react';
import { IncomingMessage, MsgKind } from '../../domain/Message';
import { DeliveryServiceSupabase } from '../../services/DeliveryServiceSupabase';
import { MlsClient, MlsGroup } from '../../mls/index';
import { useToastContext } from '../../contexts/ToastContext';
import InviteLink from '../Group/InviteLink';
import { saveSentMessage, getSentMessage, getCachedMessage } from '../../utils/mlsGroupStorage';
import { saveAndSyncWasmState } from '../../utils/wasmStateSync';
import { ArrowLeft, UserPlus, Lock } from 'lucide-react';

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
          const ts = typeof m.server_time === 'number'
            ? m.server_time
            : new Date(m.server_time as string).getTime();

          const cachedMsg = await getCachedMessage(groupId, m.server_seq).catch(() => null);
          if (cachedMsg) {
            parsed.push({
              id: `msg_${m.server_seq}`,
              senderId: cachedMsg.senderId,
              deviceId: cachedMsg.deviceId,
              text: cachedMsg.text,
              timestamp: cachedMsg.timestamp,
              serverSeq: m.server_seq,
              isSent: cachedMsg.senderId === userId,
            });
            continue;
          }

          try {
            const plaintext = await mlsClient.decryptMessage(mlsGroup, m.mls_bytes);
            await saveSentMessage(groupId, m.server_seq, plaintext, m.sender_id, m.device_id, ts)
              .catch(() => {});
            parsed.push({
              id: `msg_${m.server_seq}`,
              senderId: m.sender_id,
              deviceId: m.device_id,
              text: plaintext,
              timestamp: ts,
              serverSeq: m.server_seq,
              isSent: m.sender_id === userId,
            });
          } catch (e) {
            if (String(e).includes('CannotDecryptOwnMessage')) {
              const cached = await getSentMessage(groupId, m.server_seq).catch(() => null);
              const text = cached ?? '(your message — text unavailable on this device)';
              if (cached) {
                await saveSentMessage(groupId, m.server_seq, text, m.sender_id, m.device_id, ts)
                  .catch(() => {});
              }
              parsed.push({
                id: `msg_${m.server_seq}`,
                senderId: m.sender_id,
                deviceId: m.device_id,
                text,
                timestamp: ts,
                serverSeq: m.server_seq,
                isSent: true,
              });
            }
          }
        }
        if (mounted) {
          setMessages(prev => {
            const bySeq = new Map<number, Message>();
            parsed.forEach(p => { if (p.serverSeq != null) bySeq.set(p.serverSeq, p); });
            prev.forEach(m => { if (m.serverSeq != null) bySeq.set(m.serverSeq, m); });
            const pending = prev.filter(m => m.serverSeq == null);
            const all = [...bySeq.values(), ...pending];
            all.sort((a, b) => {
              const aSeq = a.serverSeq;
              const bSeq = b.serverSeq;
              if (aSeq != null && bSeq != null) return aSeq - bSeq;
              if (aSeq != null) return -1;
              if (bSeq != null) return 1;
              return a.timestamp - b.timestamp;
            });
            return all;
          });

          if (parsed.length > 0 && mounted) {
            mlsClient.exportState().then(stateJson =>
              saveAndSyncWasmState(userId, deviceId, stateJson)
            ).catch(e => console.warn('Failed to save WASM state after history load:', e));
          }
        }
      } catch (e) {
        console.error('Failed to load message history:', e);
      }
    };
    loadHistory();
    return () => { mounted = false; };
  }, [groupId, userId, deviceId, mlsGroup, mlsClient]);

  // Subscribe and handle incoming messages
  useEffect(() => {
    let mounted = true;

    const setupDelivery = async () => {
      try {
        await deliveryService.subscribe({ userId, deviceId, groups: [groupId] });

        deliveryService.onDeliver(async (msg: IncomingMessage) => {
          if (!mounted) return;
          if (msg.senderId === userId && msg.deviceId === deviceId) return;

          try {
            const plaintext = await mlsClient.decryptMessage(mlsGroup, msg.mlsBytes);
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
              if (prev.some(m => m.serverSeq === msg.serverSeq)) return prev;
              return [...prev, newMessage].sort((a, b) => {
                const aSeq = a.serverSeq;
                const bSeq = b.serverSeq;
                if (aSeq != null && bSeq != null) return aSeq - bSeq;
                if (aSeq != null) return -1;
                if (bSeq != null) return 1;
                return a.timestamp - b.timestamp;
              });
            });
          } catch (error) {
            const errStr = String(error);
            if (errStr.includes('CannotDecryptOwnMessage') || errStr.includes('WrongGroupId')) return;
            console.error('MLS decryption failed:', error);
          }
        });
      } catch (error) {
        console.error('Failed to setup delivery:', error);
      }
    };

    setupDelivery();
    return () => { mounted = false; };
  }, [groupId, userId, deviceId, mlsGroup, mlsClient, deliveryService]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const text = input.trim();
    const currentSeq = clientSeq;
    setClientSeq(prev => prev + 1);
    setLoading(true);

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
      const mlsBytes = await mlsClient.encryptMessage(mlsGroup, text);
      const serverSeq = await deliveryService.send({
        groupId,
        senderId: userId,
        deviceId: deviceId,
        msgKind: 'chat' as MsgKind,
        mlsBytes: mlsBytes,
        clientSeq: currentSeq,
      });

      if (serverSeq > 0) {
        saveSentMessage(groupId, serverSeq, text, userId, deviceId, Date.now())
          .catch(e => console.warn('Failed to cache sent message:', e));
      }

      setMessages(prev =>
        prev.map(m =>
          m.id === pendingId
            ? { ...m, isPending: false, serverSeq: serverSeq > 0 ? serverSeq : undefined }
            : m
        )
      );
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages(prev =>
        prev.map(m =>
          m.id === pendingId
            ? { ...m, isPending: false, text: `[failed] ${m.text}` }
            : m
        )
      );
      toast.error('Failed to send message. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const getSenderLabel = (senderId: string) => senderId === userId ? 'you' : senderId.substring(0, 12);

  return (
    <div className="flex flex-col h-full bg-black text-white">
      {/* Header */}
      <div className="h-14 border-b border-white/10 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1 text-white/40 hover:text-white transition-colors">
            <ArrowLeft size={18} />
          </button>
          <span className="text-sm font-medium">Group</span>
          <span className="font-mono text-[11px] text-white/30">{groupId.substring(0, 8)}…</span>
        </div>
        <div className="flex items-center gap-3">
          <Lock size={12} className="text-white/20" />
          <button
            onClick={() => setShowInvite(!showInvite)}
            className="p-1.5 text-white/40 hover:text-white transition-colors"
            title="Invite member"
          >
            <UserPlus size={16} />
          </button>
        </div>
      </div>

      {/* Invite panel */}
      {showInvite && (
        <div className="border-b border-white/10 px-6 py-5 bg-white/[0.02]">
          <InviteLink
            groupId={groupId}
            mlsGroup={mlsGroup}
            mlsClient={mlsClient}
            onInviteGenerated={(welcome) => {
              console.log('Welcome generated:', welcome.substring(0, 50) + '...');
            }}
          />
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <Lock size={20} className="text-white/10" />
            <p className="text-[13px] text-white/20">No messages yet</p>
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={`flex flex-col mb-6 px-6 group ${msg.isPending ? 'opacity-50' : ''}`}>
              <div className="flex items-baseline space-x-2 mb-1">
                <span className="font-semibold text-sm">{getSenderLabel(msg.senderId)}</span>
                <span className="text-[10px] text-white/30">{formatTime(msg.timestamp)}</span>
                {msg.isPending && <span className="text-[10px] text-white/20">sending…</span>}
              </div>
              <div className="text-sm text-white/90 whitespace-pre-wrap leading-relaxed">
                {msg.text}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="p-4 border-t border-white/5 bg-black shrink-0">
        <div className="flex items-center gap-3">
          <input
            type="text"
            name="message"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message…"
            className="flex-1 bg-transparent border-b border-white/10 focus:border-white/40 py-2 px-0 outline-none transition-all text-[15px] placeholder:text-white/20"
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="text-[13px] font-medium text-white/60 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Chat;
