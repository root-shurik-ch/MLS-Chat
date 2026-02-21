import React, { useState, useRef, useCallback } from 'react';
import RegistrationForm from './components/Auth/RegistrationForm';
import LoginForm from './components/Auth/LoginForm';
import GroupManagement from './components/Group/GroupManagement';
import Chat from './components/Chat/Chat';
import ConnectionStatus from './components/ConnectionStatus';
import { MlsClient, MlsGroup } from './mls/index';
import { DeliveryServiceSupabase } from './services/DeliveryServiceSupabase';
import { useToastContext } from './contexts/ToastContext';
import { saveMlsGroup, loadAllMlsGroups, loadWasmState, deleteMlsGroup } from './utils/mlsGroupStorage';
import { saveAndSyncWasmState } from './utils/wasmStateSync';
import { IndexedDBStorage } from './utils/storage';
import { Lock, LogOut } from 'lucide-react';
import { Button } from './components/ui/Button';
import type { GroupMeta } from './domain/Group';

type AppView = 'auth' | 'groups' | 'chat';

async function fetchUserGroupsFromServer(userId: string, deviceId: string): Promise<GroupMeta[]> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
  const authToken = localStorage.getItem('authToken') ?? anonKey;
  if (!supabaseUrl || !userId || !deviceId) return [];
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/user_groups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({ user_id: userId, device_id: deviceId }),
    });
    if (!res.ok) return [];
    const data = await res.json() as { groups?: Array<{ group_id: string; name: string; avatar_url?: string | null; ds_url: string }> };
    return (data.groups ?? []).map((g) => ({
      groupId: g.group_id,
      name: g.name,
      avatarUrl: g.avatar_url ?? undefined,
      dsUrl: g.ds_url,
      currentEpoch: 0,
    }));
  } catch {
    return [];
  }
}

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('auth');
  const [userId, setUserId] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null);

  const mlsClientRef = useRef<MlsClient | null>(null);
  const deliveryServiceRef = useRef<DeliveryServiceSupabase | null>(null);
  const [mlsGroups, setMlsGroups] = useState<Map<string, MlsGroup>>(new Map());
  const [isConnecting, setIsConnecting] = useState(false);

  const toast = useToastContext();

  const initializeServices = useCallback(async (userId: string, _deviceId: string) => {
    try {
      setIsConnecting(true);

      if (!mlsClientRef.current) {
        mlsClientRef.current = new MlsClient(userId);
      }

      if (!deliveryServiceRef.current) {
        deliveryServiceRef.current = new DeliveryServiceSupabase();
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const wsUrl = import.meta.env.VITE_WS_URL || (supabaseUrl
        ? (() => {
            const u = new URL(supabaseUrl);
            return (u.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + u.host + '/functions/v1/ds_send';
          })()
        : 'ws://localhost:54321/functions/v1/ds_send');
      const authToken = {
        value: localStorage.getItem('authToken') || `temp_token_${userId}`,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000
      };

      await deliveryServiceRef.current.connect(wsUrl, authToken);

      try {
        const stateJson = await loadWasmState(userId);
        if (stateJson && mlsClientRef.current) {
          await mlsClientRef.current.importState(stateJson);
          console.log('Restored WASM state from IndexedDB');

          const storedGroups = await loadAllMlsGroups();
          const restoredGroups = new Map<string, MlsGroup>();
          for (const stored of storedGroups) {
            try {
              const mlsGroup = await mlsClientRef.current.loadGroup(stored.groupId, stored.id);
              restoredGroups.set(stored.id, mlsGroup);
            } catch (e) {
              console.warn('Could not restore group', stored.id, e);
            }
          }
          if (restoredGroups.size > 0) {
            setMlsGroups(restoredGroups);
          }
        }
      } catch (e) {
        console.warn('Failed to restore WASM state:', e);
      }

      // Fetch server group membership and persist to IndexedDB for offline access.
      // This ensures the group list reflects the authoritative server state after login.
      try {
        const serverGroups = await fetchUserGroupsFromServer(userId, _deviceId);
        if (serverGroups.length > 0) {
          const groupStorage = new IndexedDBStorage('mls-groups', 'groups');
          await groupStorage.init();
          for (const g of serverGroups) {
            await groupStorage.set(g.groupId, g);
          }
          console.log(`Synced ${serverGroups.length} group(s) from server`);
        }
      } catch (e) {
        console.warn('Failed to sync groups from server:', e);
      }

      console.log('Services initialized successfully');
      toast.success('Connected');
    } catch (error) {
      console.error('Failed to initialize services:', error);
      toast.error('Failed to connect. Please try again.');
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const handleAuthSuccess = async (userId: string, deviceId: string) => {
    setUserId(userId);
    setDeviceId(deviceId);
    setView('groups');
    await initializeServices(userId, deviceId);
  };

  const handleSelectGroup = async (groupId: string) => {
    try {
      let mlsGroup = mlsGroups.get(groupId);

      if (!mlsGroup && mlsClientRef.current) {
        const storedGroups = await loadAllMlsGroups();
        const storedGroup = storedGroups.find(g => g.id === groupId);

        if (storedGroup && userId) {
          try {
            mlsGroup = await mlsClientRef.current.loadGroup(storedGroup.groupId, storedGroup.id);
          } catch {
            try {
              const stateJson = await loadWasmState(userId);
              if (stateJson) {
                await mlsClientRef.current.importState(stateJson);
                mlsGroup = await mlsClientRef.current.loadGroup(storedGroup.groupId, storedGroup.id);
              }
            } catch (e) {
              console.warn('Could not restore group from storage:', e);
            }
          }
          if (mlsGroup) {
            const newGroups = new Map(mlsGroups);
            newGroups.set(groupId, mlsGroup);
            setMlsGroups(newGroups);
          }
        }

        if (!mlsGroup && storedGroup) {
          // WASM state is unrecoverable (likely deleted on a previous logout).
          // Remove the stale record so we can reinitialize a fresh MLS state below.
          // Old messages will not decrypt, but the group becomes usable again.
          console.warn('WASM state unrecoverable for group, resetting local state:', groupId);
          await deleteMlsGroup(storedGroup.id).catch(() => {});
          toast.warning('Encryption state was reset. Old messages may not be visible.');
        }

        if (!mlsGroup) {
          mlsGroup = await mlsClientRef.current.createGroup(groupId);
          const newGroups = new Map(mlsGroups);
          newGroups.set(groupId, mlsGroup);
          setMlsGroups(newGroups);

          await saveMlsGroup(mlsGroup);
          if (userId) {
            try {
              const stateJson = await mlsClientRef.current.exportState();
              await saveAndSyncWasmState(userId, deviceId!, stateJson);
            } catch (e) {
              console.warn('Failed to save WASM state after group creation:', e);
            }
          }
        }
      }

      setCurrentGroupId(groupId);
      setView('chat');
    } catch (error) {
      console.error('Failed to select group:', error);
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Invalid user') || message.includes('Invalid device')) {
        toast.error('Session not found. Please log in again.');
      } else if (message.includes('timeout') || message.includes('Not connected')) {
        toast.error('Connection problem. Please check your connection and try again.');
      } else {
        toast.error(`Failed to open group. ${message}`);
      }
    }
  };

  const handleBackToGroups = () => {
    setCurrentGroupId(null);
    setView('groups');
  };

  const handleLogout = () => {
    if (deliveryServiceRef.current) {
      deliveryServiceRef.current.disconnect();
      deliveryServiceRef.current = null;
    }
    mlsClientRef.current = null;
    setMlsGroups(new Map());

    // Do NOT delete WASM state on logout — the state is keyed by userId and is
    // needed to restore groups on the next login. Without it, all groups on this
    // device become unrecoverable (the error "Encryption state could not be restored").
    // Security: the state is IndexedDB-local, auth is gated by WebAuthn, and the
    // auth token is cleared below, so no new messages can be fetched after logout.

    localStorage.clear();
    setUserId(null);
    setDeviceId(null);
    setCurrentGroupId(null);
    setView('auth');
  };

  // Auth view — full screen centered Key Ceremony
  if (view === 'auth') {
    const savedUserId = typeof window !== 'undefined' ? localStorage.getItem('userId') : null;
    const savedDeviceId = typeof window !== 'undefined' ? localStorage.getItem('deviceId') : null;
    const hasSavedSession = !!(savedUserId && savedDeviceId);

    const handleContinueSession = () => {
      if (savedUserId && savedDeviceId) {
        setUserId(savedUserId);
        setDeviceId(savedDeviceId);
        setView('groups');
        initializeServices(savedUserId, savedDeviceId);
      }
    };

    return (
      <div className="h-dvh bg-black text-white flex overflow-auto">
        {/* Left column — identity */}
        <div className="hidden md:flex w-72 border-r border-white/8 flex-col justify-between p-8 shrink-0">
          <div className="flex items-center gap-2">
            <Lock size={11} className="text-white/25" />
            <span className="font-mono text-[10px] text-white/25 uppercase tracking-widest">minimum.chat</span>
          </div>
          <div className="space-y-8">
            <div className="space-y-3.5">
              {[
                'Keys stay on your device.',
                'We store only ciphertext.',
                'MLS end-to-end encryption.',
                'Open source.',
              ].map((line, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="font-mono text-[10px] text-white/18 mt-0.5 shrink-0 select-none">—</span>
                  <span className="text-[13px] text-white/35 leading-snug">{line}</span>
                </div>
              ))}
            </div>
            <p className="font-mono text-[10px] text-white/12">v{__APP_VERSION__}</p>
          </div>
        </div>

        {/* Right column — forms */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-xs space-y-10 animate-fade-up">
            <div className="flex items-center gap-2 md:hidden">
              <Lock size={11} className="text-white/30" />
              <span className="font-mono text-[10px] text-white/30 uppercase tracking-widest">minimum.chat</span>
            </div>

            <div className="space-y-2">
              <h1 className="text-[22px] font-semibold tracking-tight leading-tight">
                Encrypted by default.
              </h1>
              <p className="text-[13px] text-white/30 leading-relaxed">
                No keys stored on servers. No exceptions.
              </p>
            </div>

            {hasSavedSession && (
              <div className="border border-white/10 p-4 space-y-3 animate-fade-in">
                <p className="font-mono text-[10px] text-white/35 uppercase tracking-widest">Session found</p>
                <p className="text-[13px] text-white/55">{savedUserId}</p>
                <div className="flex gap-2 pt-1">
                  <Button variant="primary" onClick={handleContinueSession} className="flex-1">
                    Continue
                  </Button>
                  <Button variant="ghost" onClick={handleLogout} className="flex-1">
                    Sign out
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-8">
              <RegistrationForm onSuccess={handleAuthSuccess} />
              <div className="h-px bg-white/5" />
              <LoginForm onSuccess={handleAuthSuccess} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Sidebar (reused in both groups & chat views on desktop) ──────────────
  const Sidebar = ({ fullWidthOnMobile = false }: { fullWidthOnMobile?: boolean }) => (
    <aside className={[
      'flex flex-col h-full bg-black',
      fullWidthOnMobile
        // groups view: full width on mobile, fixed sidebar on desktop
        ? 'w-full md:w-[17rem] md:shrink-0 md:border-r md:border-white/8'
        // chat view: hidden on mobile, sidebar on desktop
        : 'hidden md:flex md:w-[17rem] md:shrink-0 md:border-r md:border-white/8',
    ].join(' ')}>
      <div className="h-14 border-b border-white/8 px-5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Lock size={11} className="text-white/20" />
          <span className="font-mono text-[11px] text-white/30 tracking-widest uppercase">minimum.chat</span>
        </div>
        <button
          onClick={handleLogout}
          className="p-2.5 -mr-1.5 text-white/25 hover:text-white/70 transition-colors"
          title="Log out"
        >
          <LogOut size={14} />
        </button>
      </div>

      {isConnecting && (
        <div className="px-5 py-2 border-b border-white/5">
          <span className="font-mono text-[10px] text-white/25 uppercase tracking-widest">connecting…</span>
        </div>
      )}

      <div className="flex-1 overflow-hidden min-h-0">
        <GroupManagement
          userId={userId!}
          deviceId={deviceId!}
          mlsClient={mlsClientRef.current}
          onSelectGroup={handleSelectGroup}
        />
      </div>
    </aside>
  );

  // Groups view
  // Mobile: full-screen list | Desktop: sidebar + placeholder
  if (view === 'groups') {
    return (
      <div className="h-dvh bg-black text-white flex overflow-hidden">
        <ConnectionStatus deliveryService={deliveryServiceRef.current} />
        <Sidebar fullWidthOnMobile />
        {/* Desktop-only placeholder */}
        <main className="hidden md:flex flex-1 items-center justify-center">
          <div className="text-center space-y-3">
            <Lock size={16} className="text-white/8 mx-auto" />
            <p className="font-mono text-[11px] text-white/18 uppercase tracking-widest">Select a group</p>
          </div>
        </main>
      </div>
    );
  }

  // Chat view
  const currentMlsGroup = currentGroupId ? mlsGroups.get(currentGroupId) : null;

  if (!currentMlsGroup || !mlsClientRef.current || !deliveryServiceRef.current) {
    return (
      <div className="h-dvh bg-black text-white flex overflow-hidden">
        <ConnectionStatus deliveryService={deliveryServiceRef.current} />
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <p className="font-mono text-[11px] text-white/20 uppercase tracking-widest">Loading…</p>
        </main>
      </div>
    );
  }

  // Mobile: full-screen chat | Desktop: sidebar + chat
  return (
    <div className="h-dvh bg-black text-white flex overflow-hidden">
      <ConnectionStatus deliveryService={deliveryServiceRef.current} />
      <Sidebar />
      <main className="flex-1 h-full overflow-hidden">
        <Chat
          userId={userId!}
          deviceId={deviceId!}
          groupId={currentGroupId!}
          mlsGroup={currentMlsGroup}
          mlsClient={mlsClientRef.current}
          deliveryService={deliveryServiceRef.current}
          onBack={handleBackToGroups}
        />
      </main>
    </div>
  );
};

export default App;
