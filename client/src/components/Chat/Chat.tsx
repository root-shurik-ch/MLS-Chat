import React, { useState, useEffect, useRef } from 'react';
import { IncomingMessage, MsgKind } from '../../domain/Message';
import { DeliveryServiceSupabase } from '../../services/DeliveryServiceSupabase';
import { MlsClient, MlsGroup } from '../../mls/index';
import { useToastContext } from '../../contexts/ToastContext';
import InviteLink from '../Group/InviteLink';
import GroupMembers from '../Group/GroupMembers';
import { saveSentMessage, getSentMessage, getCachedMessage } from '../../utils/mlsGroupStorage';
import { saveAndSyncWasmState } from '../../utils/wasmStateSync';
import { runMlsOp } from '../../utils/mlsLock';
import { KeyManager } from '../../utils/keyManager';
import { encryptString, decryptString } from '../../utils/crypto';
import { ArrowLeft, UserPlus, Users, Lock, Paperclip, Download } from 'lucide-react';
import { ConnectionState } from '../../utils/WebSocketManager';
import { senderColor } from '../../utils/senderColor';
import { FileCard } from '../ui/Molecules/FileCard';
import { encryptFile, decryptFile, compressImageForChat, extractVideoThumbnail } from '../../utils/fileEncryption';

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

interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  site_name: string | null;
}

interface FilePayload {
  t: 'file';
  url: string;
  k: string;
  iv: string;
  n: string;
  m: string;
  s: number;
  thumb?: string;
}

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'apikey': ANON_KEY,
    'Authorization': `Bearer ${localStorage.getItem('authToken') ?? ANON_KEY}`,
  };
}

function parseFilePayload(text: string): FilePayload | null {
  try {
    const j = JSON.parse(text);
    if (j.t === 'file' && j.url && j.k && j.iv) return j as FilePayload;
  } catch {}
  return null;
}

interface CachedMsgPayload {
  text: string;
  senderId: string;
  deviceId: string;
  timestamp: number;
}

/**
 * Upload an encrypted copy of a decrypted message to the server message cache.
 * Fire-and-forget — never blocks the caller. Requires kMsgCache in IndexedDB.
 */
async function uploadMessageToCache(
  groupId: string,
  serverSeq: number,
  text: string,
  senderId: string,
  senderDeviceId: string,
  userId: string,
  myDeviceId: string,  // current user's own device — used for server auth
  timestamp: number,
): Promise<void> {
  if (!SUPABASE_URL) return;
  const km = new KeyManager();
  await km.init();
  const kMsgCache = await km.getKMsgCache(userId);
  if (!kMsgCache) return; // Not available until passkey auth — skip silently

  const aad = `${groupId}:${serverSeq}`;
  const payload: CachedMsgPayload = { text, senderId, deviceId: senderDeviceId, timestamp };
  const plaintextEnc = await encryptString(JSON.stringify(payload), kMsgCache, aad);

  await fetch(`${SUPABASE_URL}/functions/v1/message_cache_sync`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      action: 'upsert',
      group_id: groupId,
      server_seq: serverSeq,
      user_id: userId,
      device_id: myDeviceId,  // must belong to userId — sender's device may differ
      plaintext_enc: plaintextEnc,
    }),
  });
}

/**
 * Fetch encrypted messages from the server cache and decrypt them with kMsgCache.
 * Returns a Map from server_seq to CachedMsgPayload.
 */
async function fetchMessagesFromServerCache(
  groupId: string,
  userId: string,
  deviceId: string,
  seqs: number[],
): Promise<Map<number, CachedMsgPayload>> {
  const result = new Map<number, CachedMsgPayload>();
  if (!SUPABASE_URL || seqs.length === 0) return result;

  const km = new KeyManager();
  await km.init();
  const kMsgCache = await km.getKMsgCache(userId);
  if (!kMsgCache) return result;

  // Fetch all cached entries since the minimum seq in our list
  const minSeq = Math.min(...seqs) - 1;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/message_cache_sync`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        action: 'fetch',
        group_id: groupId,
        user_id: userId,
        device_id: deviceId,
        since_seq: minSeq,
      }),
    });
    if (!res.ok) return result;
    const data = await res.json() as { messages?: Array<{ server_seq: number; plaintext_enc: string }> };
    const seqSet = new Set(seqs);
    for (const row of data.messages ?? []) {
      if (!seqSet.has(row.server_seq)) continue;
      try {
        const aad = `${groupId}:${row.server_seq}`;
        const plainJson = await decryptString(row.plaintext_enc, kMsgCache, aad);
        result.set(row.server_seq, JSON.parse(plainJson) as CachedMsgPayload);
      } catch {
        // Corrupted or encrypted with a different key — skip
      }
    }
  } catch {
    // Network error — return what we have
  }
  return result;
}

// FilePreview renders inside a chat bubble for file messages.
const FilePreview: React.FC<{
  payload: FilePayload;
  mediaCache: Map<string, string>;
  onDecrypted: (url: string, objectUrl: string) => void;
}> = ({ payload, mediaCache, onDecrypted }) => {
  const { url, k, iv, n, m, s, thumb } = payload;
  const cachedUrl = mediaCache.get(url);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (cachedUrl || loading || error) return;
    if (!m.startsWith('image/') && !m.startsWith('video/')) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('fetch failed');
        const encryptedBytes = await res.arrayBuffer();
        const decrypted = await decryptFile(encryptedBytes, k, iv);
        const objectUrl = URL.createObjectURL(new Blob([decrypted], { type: m }));
        if (!cancelled) onDecrypted(url, objectUrl);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [url, k, iv, m, cachedUrl]);

  const handleDownload = async () => {
    try {
      let objectUrl = cachedUrl;
      if (!objectUrl) {
        const res = await fetch(url);
        const encryptedBytes = await res.arrayBuffer();
        const decrypted = await decryptFile(encryptedBytes, k, iv);
        objectUrl = URL.createObjectURL(new Blob([decrypted], { type: m }));
        onDecrypted(url, objectUrl);
      }
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = n;
      a.click();
    } catch {}
  };

  if (m.startsWith('image/')) {
    if (loading && !cachedUrl) {
      return (
        <div className="w-48 h-32 rounded-xl bg-white/5 flex items-center justify-center">
          <span className="font-mono text-[10px] text-white/25">loading…</span>
        </div>
      );
    }
    if (error) {
      return (
        <div className="w-48 h-32 rounded-xl bg-white/5 flex items-center justify-center">
          <span className="font-mono text-[10px] text-red-400/50">failed to load</span>
        </div>
      );
    }
    if (cachedUrl) {
      return (
        <img
          src={cachedUrl}
          alt={n}
          className="rounded-xl max-w-full max-h-64 object-cover cursor-pointer block"
          onClick={() => window.open(cachedUrl, '_blank')}
        />
      );
    }
    return null;
  }

  if (m.startsWith('video/')) {
    if (cachedUrl) {
      return (
        <video
          src={cachedUrl}
          controls
          poster={thumb}
          className="rounded-xl max-w-full max-h-64 block"
          playsInline
        />
      );
    }
    if (loading) {
      return (
        <div className="w-48 h-32 rounded-xl bg-white/5 flex items-center justify-center relative overflow-hidden">
          {thumb && (
            <img src={thumb} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
          )}
          <span className="font-mono text-[10px] text-white/40 relative z-10">loading…</span>
        </div>
      );
    }
    if (thumb) {
      return (
        <div className="relative rounded-xl overflow-hidden max-w-full max-h-64 cursor-pointer"
          onClick={() => setLoading(true) /* triggers useEffect */}
        >
          <img src={thumb} alt={n} className="max-w-full max-h-64 object-cover block" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <div className="ml-1 w-0 h-0 border-l-[14px] border-l-white border-y-[8px] border-y-transparent" />
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="w-48 h-32 rounded-xl bg-white/5 flex items-center justify-center">
        <span className="font-mono text-[10px] text-white/25">loading…</span>
      </div>
    );
  }

  // Other files — FileCard + download
  return (
    <div className="space-y-1.5">
      <FileCard fileName={n} sizeBytes={s} />
      <button
        onClick={handleDownload}
        className="flex items-center gap-1.5 font-mono text-[10px] text-white/35 hover:text-white/70 transition-colors uppercase tracking-widest"
      >
        <Download size={10} />
        Download
      </button>
    </div>
  );
};


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
  const [uploadingFile, setUploadingFile] = useState(false);
  const [clientSeq, setClientSeq] = useState(() =>
    Number(localStorage.getItem(`min:clientSeq:${groupId}`) ?? '1')
  );
  const [showInvite, setShowInvite] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [memberAvatars, setMemberAvatars] = useState<Map<string, string>>(new Map());
  const [linkPreviews, setLinkPreviews] = useState<Map<string, LinkPreview | null>>(new Map());
  const [mediaCache, setMediaCache] = useState<Map<string, string>>(new Map());
  // Incremented on WebSocket reconnect to trigger a history re-fetch for missed messages.
  const [reconnectCount, setReconnectCount] = useState(0);
  const hasConnectedRef = useRef(false);
  // Highest server_seq seen — used to pass since_seq on reconnect loads.
  const maxSeqRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toast = useToastContext();

  // Re-fetch history when WebSocket reconnects so messages sent during outage appear.
  useEffect(() => {
    // If the WebSocket is already connected when Chat mounts (App.tsx connected before
    // this component rendered), mark it as seen so the first actual reconnect —
    // not the already-past initial connect — triggers a history re-fetch.
    if (deliveryService.getConnectionState() === ConnectionState.CONNECTED) {
      hasConnectedRef.current = true;
    }

    const unsubscribe = deliveryService.onStateChange((state: ConnectionState) => {
      if (state === ConnectionState.CONNECTED) {
        if (hasConnectedRef.current) {
          // This is a reconnect (not the initial connection).
          setReconnectCount(c => c + 1);
        }
        hasConnectedRef.current = true;
      }
    });
    return unsubscribe;
  }, [deliveryService]);

  const handleMediaDecrypted = (fileUrl: string, objectUrl: string) => {
    setMediaCache(prev => new Map(prev).set(fileUrl, objectUrl));
  };

  // Fetch avatar URLs for group members
  useEffect(() => {
    if (!SUPABASE_URL) return;
    fetch(`${SUPABASE_URL}/functions/v1/group_members_list`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ group_id: groupId, user_id: userId, device_id: deviceId }),
    })
      .then(r => r.json())
      .then((data: { members?: Array<{ user_id: string; avatar_url: string | null }> }) => {
        const map = new Map<string, string>();
        for (const m of data.members ?? []) {
          if (m.avatar_url) map.set(m.user_id, m.avatar_url);
        }
        setMemberAvatars(map);
      })
      .catch(() => {});
  }, [groupId, userId, deviceId]);

  // Fetch link previews for URLs found in messages
  useEffect(() => {
    if (!SUPABASE_URL) return;

    const toFetch = new Set<string>();
    for (const msg of messages) {
      if (parseFilePayload(msg.text)) continue;
      for (const url of msg.text.match(URL_REGEX) ?? []) {
        if (!linkPreviews.has(url)) toFetch.add(url);
      }
    }
    if (toFetch.size === 0) return;

    setLinkPreviews(prev => {
      const next = new Map(prev);
      for (const url of toFetch) next.set(url, null);
      return next;
    });

    for (const url of toFetch) {
      fetch(`${SUPABASE_URL}/functions/v1/link_preview`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ url }),
      })
        .then(r => r.json())
        .then((data: LinkPreview & { error?: string }) => {
          if (data.error || !data.title) return;
          setLinkPreviews(prev => new Map(prev).set(url, data));
        })
        .catch(() => {});
    }
  }, [messages]);

  // Load message history when opening chat
  useEffect(() => {
    let mounted = true;
    if (!SUPABASE_URL) return;

    const loadHistory = async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/get_messages`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            group_id: groupId,
            user_id: userId,
            device_id: deviceId,
            // On reconnect, only fetch messages we haven't seen yet.
            ...(reconnectCount > 0 && maxSeqRef.current > 0 ? { since_seq: maxSeqRef.current } : {}),
          }),
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

        // Collect seq numbers that will need MLS decrypt, to pre-fetch server cache in one request
        const chatMessages = list.filter(m => m.msg_kind !== 'commit');
        const seqsMissingLocal: number[] = [];
        for (const m of chatMessages) {
          const cached = await getCachedMessage(groupId, m.server_seq).catch(() => null);
          if (!cached) seqsMissingLocal.push(m.server_seq);
        }
        // Pre-fetch server cache for all messages not in local IndexedDB
        const serverCacheMap = await fetchMessagesFromServerCache(
          groupId, userId, deviceId, seqsMissingLocal
        );

        const parsed: Message[] = [];
        for (const m of list) {
          if (m.msg_kind === 'commit') {
            try {
              await runMlsOp(() => mlsClient.applyCommit(mlsGroup, { proposals: [], commit: m.mls_bytes, epochAuthenticator: '' }));
            } catch { /* already applied */ }
            continue;
          }

          const ts = typeof m.server_time === 'number'
            ? m.server_time
            : new Date(m.server_time as string).getTime();

          // 1. Local IndexedDB cache hit
          const cachedMsg = await getCachedMessage(groupId, m.server_seq).catch(() => null);
          if (cachedMsg) {
            if (m.server_seq > maxSeqRef.current) maxSeqRef.current = m.server_seq;
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

          // 2. Try MLS decryption — the entire cache-check + decrypt + cache-write is inside
          //    the mutex so no concurrent op can race to decrypt the same message.
          try {
            const result = await runMlsOp(async () => {
              // Re-check cache inside mutex: a concurrent op may have just written it
              const locked = await getCachedMessage(groupId, m.server_seq).catch(() => null);
              if (locked) return locked;
              const text = await mlsClient.decryptMessage(mlsGroup, m.mls_bytes);
              // Write to cache before releasing the mutex so the next op sees it
              await saveSentMessage(groupId, m.server_seq, text, m.sender_id, m.device_id, ts).catch(() => {});
              return { text, senderId: m.sender_id, deviceId: m.device_id, timestamp: ts };
            });
            uploadMessageToCache(groupId, m.server_seq, result.text, result.senderId, result.deviceId, userId, deviceId, ts)
              .catch(() => {});
            if (m.server_seq > maxSeqRef.current) maxSeqRef.current = m.server_seq;
            parsed.push({
              id: `msg_${m.server_seq}`,
              senderId: result.senderId,
              deviceId: result.deviceId,
              text: result.text,
              timestamp: result.timestamp,
              serverSeq: m.server_seq,
              isSent: result.senderId === userId,
            });
            continue;
          } catch (e) {
            if (String(e).includes('CannotDecryptOwnMessage')) {
              const cached = await getSentMessage(groupId, m.server_seq).catch(() => null);
              const text = cached ?? '(your message — text unavailable on this device)';
              if (cached) {
                await saveSentMessage(groupId, m.server_seq, text, m.sender_id, m.device_id, ts)
                  .catch(() => {});
                uploadMessageToCache(groupId, m.server_seq, text, m.sender_id, m.device_id, userId, deviceId, ts)
                  .catch(() => {});
              }
              if (m.server_seq > maxSeqRef.current) maxSeqRef.current = m.server_seq;
              parsed.push({
                id: `msg_${m.server_seq}`,
                senderId: m.sender_id,
                deviceId: m.device_id,
                text,
                timestamp: ts,
                serverSeq: m.server_seq,
                isSent: true,
              });
              continue;
            }
            // MLS decryption failed (e.g. old epoch) — fall through to server cache
            console.warn('[Chat] MLS decrypt failed for seq', m.server_seq, ':', e);
          }

          // 3. Server cache fallback — for messages from old epochs or cross-device
          const serverMsg = serverCacheMap.get(m.server_seq);
          if (serverMsg) {
            await saveSentMessage(
              groupId, m.server_seq, serverMsg.text,
              serverMsg.senderId, serverMsg.deviceId, serverMsg.timestamp,
            ).catch(() => {});
            if (m.server_seq > maxSeqRef.current) maxSeqRef.current = m.server_seq;
            parsed.push({
              id: `msg_${m.server_seq}`,
              senderId: serverMsg.senderId,
              deviceId: serverMsg.deviceId,
              text: serverMsg.text,
              timestamp: serverMsg.timestamp,
              serverSeq: m.server_seq,
              isSent: serverMsg.senderId === userId,
            });
            continue;
          }

          // 4. Unrecoverable — message not in any cache
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
  }, [groupId, userId, deviceId, mlsGroup, mlsClient, reconnectCount]);

  // Subscribe and handle incoming messages
  useEffect(() => {
    let mounted = true;

    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingStateJson: string | null = null;

    const scheduleSave = (stateJson: string) => {
      pendingStateJson = stateJson;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = null;
        const json = pendingStateJson;
        pendingStateJson = null;
        if (json) saveAndSyncWasmState(userId, deviceId, json).catch(e =>
          console.warn('[Chat] Failed to save WASM state (debounced):', e)
        );
      }, 800);
    };

    const flushPendingSave = () => {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      if (pendingStateJson) {
        const json = pendingStateJson;
        pendingStateJson = null;
        saveAndSyncWasmState(userId, deviceId, json).catch(() => {});
      }
    };

    const setupDelivery = async () => {
      try {
        // Only subscribe if already connected — DeliveryServiceSupabase handles
        // auto-resubscription on reconnect via its own onStateChange handler.
        if (deliveryService.isConnected()) {
          await deliveryService.subscribe({ userId, deviceId, groups: [groupId] });
        }

        deliveryService.onDeliver(async (msg: IncomingMessage) => {
          if (!mounted) return;
          if (msg.groupId !== groupId) return;
          if (msg.senderId === userId && msg.deviceId === deviceId) return;

          if (msg.msgKind === 'commit') {
            try {
              await runMlsOp(() => mlsClient.applyCommit(mlsGroup, { proposals: [], commit: msg.mlsBytes, epochAuthenticator: '' }));
              const stateJson = await mlsClient.exportState();
              scheduleSave(stateJson);
            } catch (e) {
              console.warn('[Chat] applyCommit (likely already at new epoch):', e);
            }
            return;
          }

          try {
            const result = await runMlsOp(async () => {
              // Re-check cache: concurrent loadHistory may have already processed this message
              const locked = await getCachedMessage(groupId, msg.serverSeq).catch(() => null);
              if (locked) return locked;
              const text = await mlsClient.decryptMessage(mlsGroup, msg.mlsBytes);
              await saveSentMessage(groupId, msg.serverSeq, text, msg.senderId, msg.deviceId, msg.serverTime).catch(() => {});
              return { text, senderId: msg.senderId, deviceId: msg.deviceId, timestamp: msg.serverTime };
            });
            uploadMessageToCache(
              groupId, msg.serverSeq, result.text, result.senderId, result.deviceId, userId, deviceId, msg.serverTime
            ).catch(() => {});
            if (msg.serverSeq > maxSeqRef.current) maxSeqRef.current = msg.serverSeq;
            const newMessage: Message = {
              id: `msg_${msg.serverSeq}`,
              senderId: result.senderId,
              deviceId: result.deviceId,
              text: result.text,
              timestamp: result.timestamp,
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
    return () => { mounted = false; flushPendingSave(); };
  }, [groupId, userId, deviceId, mlsGroup, mlsClient, deliveryService]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const text = input.trim();
    const currentSeq = clientSeq;
    const nextSeq = currentSeq + 1;
    setClientSeq(nextSeq);
    localStorage.setItem(`min:clientSeq:${groupId}`, String(nextSeq));
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
      const mlsBytes = await runMlsOp(() => mlsClient.encryptMessage(mlsGroup, text));
      const serverSeq = await deliveryService.send({
        groupId,
        senderId: userId,
        deviceId: deviceId,
        msgKind: 'chat' as MsgKind,
        mlsBytes: mlsBytes,
        clientSeq: currentSeq,
      });

      if (serverSeq > 0) {
        const sentAt = Date.now();
        saveSentMessage(groupId, serverSeq, text, userId, deviceId, sentAt)
          .catch(e => console.warn('Failed to cache sent message:', e));
        uploadMessageToCache(groupId, serverSeq, text, userId, deviceId, userId, deviceId, sentAt)
          .catch(() => {});
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !SUPABASE_URL) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    // Size limits
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const MAX_IMAGE = 20 * 1024 * 1024;
    const MAX_VIDEO = 100 * 1024 * 1024;
    const MAX_OTHER = 50 * 1024 * 1024;

    if (isImage && file.size > MAX_IMAGE) {
      toast.error('Image too large (max 20 MB)');
      return;
    }
    if (isVideo && file.size > MAX_VIDEO) {
      toast.error('Video too large (max 100 MB)');
      return;
    }
    if (!isImage && !isVideo && file.size > MAX_OTHER) {
      toast.error('File too large (max 50 MB)');
      return;
    }

    setUploadingFile(true);
    const pendingId = `pending_${Date.now()}`;
    // Show a placeholder while uploading
    const pendingText = JSON.stringify({ t: 'file', url: '', k: '', iv: '', n: file.name, m: file.type, s: file.size });
    setMessages(prev => [...prev, {
      id: pendingId,
      senderId: userId,
      deviceId,
      text: pendingText,
      timestamp: Date.now(),
      isSent: true,
      isPending: true,
    }]);

    try {
      // 1. Compress images, extract video thumbnail
      let blobToEncrypt: File | Blob = file;
      let thumb: string | null = null;

      if (isImage) {
        blobToEncrypt = await compressImageForChat(file);
      } else if (isVideo) {
        thumb = await extractVideoThumbnail(file);
      }

      // 2. Encrypt
      const { encryptedBytes, keyB64, ivB64 } = await encryptFile(blobToEncrypt);

      // 3. Get signed upload URL
      const urlRes = await fetch(`${SUPABASE_URL}/functions/v1/file_upload_url`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ group_id: groupId, user_id: userId, device_id: deviceId }),
      });
      if (!urlRes.ok) throw new Error('Failed to get upload URL');
      const { signed_url, public_url } = await urlRes.json() as { signed_url: string; public_url: string };

      // 4. PUT encrypted bytes directly to Storage
      // Slice to plain ArrayBuffer (BodyInit requires ArrayBuffer, not Uint8Array<ArrayBufferLike>)
      const uploadBody = encryptedBytes.buffer.slice(
        encryptedBytes.byteOffset,
        encryptedBytes.byteOffset + encryptedBytes.byteLength,
      ) as ArrayBuffer;
      const uploadRes = await fetch(signed_url, {
        method: 'PUT',
        body: uploadBody,
        headers: { 'Content-Type': 'application/octet-stream' },
      });
      if (!uploadRes.ok) throw new Error('Storage upload failed');

      // 5. Build payload
      const originalSize = isImage ? (blobToEncrypt as Blob).size : file.size;
      const payload: FilePayload = {
        t: 'file',
        url: public_url,
        k: keyB64,
        iv: ivB64,
        n: file.name,
        m: file.type,
        s: originalSize,
        ...(thumb ? { thumb } : {}),
      };
      const payloadStr = JSON.stringify(payload);

      // 6. MLS-encrypt and send
      const currentSeq = clientSeq;
      const nextFileSeq = currentSeq + 1;
      setClientSeq(nextFileSeq);
      localStorage.setItem(`min:clientSeq:${groupId}`, String(nextFileSeq));
      const mlsBytes = await runMlsOp(() => mlsClient.encryptMessage(mlsGroup, payloadStr));
      const serverSeq = await deliveryService.send({
        groupId,
        senderId: userId,
        deviceId,
        msgKind: 'chat' as MsgKind,
        mlsBytes,
        clientSeq: currentSeq,
      });

      if (serverSeq > 0) {
        const sentAt = Date.now();
        saveSentMessage(groupId, serverSeq, payloadStr, userId, deviceId, sentAt)
          .catch(() => {});
        uploadMessageToCache(groupId, serverSeq, payloadStr, userId, deviceId, userId, deviceId, sentAt)
          .catch(() => {});
      }

      setMessages(prev =>
        prev.map(m =>
          m.id === pendingId
            ? { ...m, isPending: false, text: payloadStr, serverSeq: serverSeq > 0 ? serverSeq : undefined }
            : m
        )
      );
    } catch (err) {
      console.error('File send failed:', err);
      setMessages(prev => prev.filter(m => m.id !== pendingId));
      toast.error('Failed to send file. Please try again.');
    } finally {
      setUploadingFile(false);
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full bg-black text-white">
      {/* Header */}
      <div className="h-14 border-b border-white/8 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={onBack}
            className="p-2.5 -ml-1.5 text-white/40 hover:text-white active:text-white/60 transition-colors md:text-white/25"
            aria-label="Back to groups"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="text-[14px] font-medium text-white/90">Group</span>
          <span className="font-mono text-[11px] text-white/20 ml-1.5 hidden sm:inline">
            {groupId.substring(0, 8)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Lock size={10} className="text-white/12 hidden sm:block" />
          <button
            onClick={() => { setShowMembers(v => !v); setShowInvite(false); }}
            className={`p-2.5 transition-colors ${showMembers ? 'text-white' : 'text-white/30 hover:text-white'}`}
            title="Members"
          >
            <Users size={14} />
          </button>
          <button
            onClick={() => { setShowInvite(v => !v); setShowMembers(false); }}
            className={`p-2.5 -mr-1.5 transition-colors ${showInvite ? 'text-white' : 'text-white/30 hover:text-white'}`}
            title="Invite member"
          >
            <UserPlus size={16} />
          </button>
        </div>
      </div>

      {/* Invite panel */}
      {showInvite && (
        <div className="border-b border-white/10 px-6 py-5 bg-white/[0.02] animate-fade-in">
          <InviteLink
            groupId={groupId}
            userId={userId}
            deviceId={deviceId}
            mlsGroup={mlsGroup}
            mlsClient={mlsClient}
          />
        </div>
      )}

      {/* Members panel */}
      {showMembers && (
        <div className="border-b border-white/10 bg-white/[0.02] animate-fade-in">
          <GroupMembers groupId={groupId} userId={userId} deviceId={deviceId} />
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Lock size={18} className="text-white/8" />
            <p className="font-mono text-[11px] text-white/20 uppercase tracking-widest">
              end-to-end encrypted
            </p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const prevMsg = i > 0 ? messages[i - 1] : null;
            const isSameSender = prevMsg !== null && prevMsg.senderId === msg.senderId;
            const color = senderColor(msg.senderId);
            const filePayload = parseFilePayload(msg.text);
            const isFile = filePayload !== null;

            return (
              <div
                key={msg.id}
                className={`flex items-end px-4 ${msg.isSent ? 'justify-end' : 'justify-start'} ${isSameSender ? 'mt-0.5' : 'mt-2'} ${msg.isPending ? 'opacity-50' : ''}`}
              >
                {/* Avatar circle — only for others' messages */}
                {!msg.isSent && (
                  <div className="w-[22px] h-[22px] rounded-full shrink-0 mr-2 mb-0.5 overflow-hidden"
                    style={!memberAvatars.has(msg.senderId) ? { backgroundColor: color + '1a', border: `1px solid ${color}33` } : {}}
                  >
                    {memberAvatars.has(msg.senderId) ? (
                      <img
                        src={memberAvatars.get(msg.senderId)}
                        alt={msg.senderId}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] font-semibold select-none"
                        style={{ color }}
                      >
                        {msg.senderId.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                )}

                <div className={`flex flex-col max-w-[75%] ${msg.isSent ? 'items-end' : 'items-start'}`}>
                  {/* Username label — only for others, only first in a consecutive run */}
                  {!msg.isSent && !isSameSender && (
                    <span
                      className="text-[11px] font-medium mb-1 ml-1 truncate max-w-full"
                      style={{ color }}
                    >
                      {msg.senderId}
                    </span>
                  )}

                  {/* Bubble */}
                  <div
                    className={`${isFile ? 'p-2' : 'px-3 py-2'} ${
                      msg.isSent
                        ? 'bg-white/10 rounded-2xl rounded-br-sm'
                        : 'bg-white/[0.07] rounded-2xl rounded-bl-sm'
                    }`}
                  >
                    {isFile ? (
                      <>
                        <FilePreview
                          payload={filePayload}
                          mediaCache={mediaCache}
                          onDecrypted={handleMediaDecrypted}
                        />
                        <div className="flex items-center justify-end gap-1 mt-1">
                          <span className="font-mono text-[10px] text-white/30 tabular-nums">
                            {formatTime(msg.timestamp)}
                          </span>
                          {msg.isPending && (
                            <span className="font-mono text-[10px] text-white/20">…</span>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="text-[15px] text-white/85 whitespace-pre-wrap leading-relaxed break-words block">
                          {msg.text}
                        </span>
                        <div className="flex items-center justify-end gap-1 mt-0.5">
                          <span className="font-mono text-[10px] text-white/30 tabular-nums">
                            {formatTime(msg.timestamp)}
                          </span>
                          {msg.isPending && (
                            <span className="font-mono text-[10px] text-white/20">…</span>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Link preview card — only for non-file text messages */}
                  {!isFile && (() => {
                    const url = (msg.text.match(URL_REGEX) ?? [])[0];
                    const preview = url ? linkPreviews.get(url) : undefined;
                    if (!preview?.title) return null;
                    return (
                      <a
                        href={preview.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 block w-full rounded-xl overflow-hidden border border-white/10 hover:border-white/20 transition-colors no-underline"
                        style={{ background: 'rgba(255,255,255,0.04)' }}
                      >
                        {preview.image && (
                          <img
                            src={preview.image}
                            alt=""
                            className="w-full h-28 object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        )}
                        <div className="px-3 py-2 space-y-0.5">
                          {preview.site_name && (
                            <p className="font-mono text-[10px] text-white/30 uppercase tracking-widest truncate">
                              {preview.site_name}
                            </p>
                          )}
                          <p className="text-[13px] text-white/80 font-medium leading-snug"
                            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {preview.title}
                          </p>
                          {preview.description && (
                            <p className="text-[12px] text-white/40 leading-snug"
                              style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {preview.description}
                            </p>
                          )}
                        </div>
                      </a>
                    );
                  })()}
                </div>

                {/* Spacer on the left for own messages (mirrors avatar width) */}
                {msg.isSent && <div className="w-[22px] shrink-0 ml-2" />}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div
        className="px-4 pt-3 border-t border-white/5 bg-black shrink-0"
        style={{ paddingBottom: 'max(0.875rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingFile || loading}
            className="p-1 -ml-1 text-white/25 hover:text-white/60 active:text-white/40 disabled:opacity-15 disabled:cursor-not-allowed transition-colors shrink-0"
            title="Attach file"
            aria-label="Attach file"
          >
            {uploadingFile ? (
              <span className="font-mono text-[11px] text-white/25">…</span>
            ) : (
              <Paperclip size={15} />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,*/*"
            className="hidden"
            onChange={handleFileSelect}
          />
          <span className="font-mono text-[13px] text-white/18 shrink-0 select-none">›</span>
          <input
            type="text"
            name="message"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message…"
            className="flex-1 bg-transparent border-b border-white/8 focus:border-white/35 py-3 px-0 outline-none transition-colors duration-150 text-[16px] md:text-[15px] text-white placeholder:text-white/18 font-sans"
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            disabled={loading || uploadingFile}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button
            onClick={handleSend}
            disabled={loading || uploadingFile || !input.trim()}
            className="p-1.5 -mr-1 font-mono text-[11px] text-white/35 hover:text-white active:text-white/60 disabled:opacity-15 disabled:cursor-not-allowed transition-colors uppercase tracking-widest shrink-0"
          >
            {loading ? '…' : 'send'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Chat;
