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
import { Lock, LogOut } from 'lucide-react';
import { Button } from './components/ui/Button';

type AppView = 'auth' | 'groups' | 'chat';

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
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-10">
          {/* Header */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Lock size={16} className="text-white/40" />
              <span className="font-mono text-[11px] text-white/30 uppercase tracking-widest">minimum.chat</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">End-to-end encrypted.</h1>
            <p className="text-[13px] text-white/40 leading-relaxed">
              Keys stay on your device. We store nothing but encrypted noise.
            </p>
          </div>

          {/* Saved session */}
          {hasSavedSession && (
            <div className="border border-white/10 p-4 space-y-3">
              <p className="text-[13px] text-white/60">You have a saved session.</p>
              <div className="flex gap-3">
                <Button variant="primary" onClick={handleContinueSession} className="flex-1">
                  Continue
                </Button>
                <Button variant="ghost" onClick={handleLogout} className="flex-1">
                  Sign out
                </Button>
              </div>
            </div>
          )}

          {/* Forms */}
          <div className="space-y-8">
            <RegistrationForm onSuccess={handleAuthSuccess} />
            <div className="border-t border-white/5" />
            <LoginForm onSuccess={handleAuthSuccess} />
          </div>

          <p className="font-mono text-[10px] text-white/15">v{__APP_VERSION__}</p>
        </div>
      </div>
    );
  }

  // Groups view — sidebar layout
  if (view === 'groups') {
    return (
      <div className="min-h-screen bg-black text-white flex">
        <ConnectionStatus deliveryService={deliveryServiceRef.current} />

        {/* Sidebar */}
        <aside className="w-72 border-r border-white/10 h-screen flex flex-col">
          <div className="h-14 border-b border-white/10 px-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock size={12} className="text-white/20" />
              <span className="text-sm font-medium">minimum.chat</span>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 text-white/30 hover:text-white transition-colors"
              title="Log out"
            >
              <LogOut size={15} />
            </button>
          </div>

          {isConnecting && (
            <div className="px-4 py-2 border-b border-white/5">
              <span className="text-[11px] text-white/30">Connecting…</span>
            </div>
          )}

          <div className="flex-1 overflow-hidden">
            <GroupManagement
              userId={userId!}
              deviceId={deviceId!}
              mlsClient={mlsClientRef.current}
              onSelectGroup={handleSelectGroup}
            />
          </div>
        </aside>

        {/* Main area placeholder */}
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <Lock size={24} className="text-white/10 mx-auto" />
            <p className="text-[13px] text-white/20">Select a group to start chatting</p>
          </div>
        </main>
      </div>
    );
  }

  // Chat view
  const currentMlsGroup = currentGroupId ? mlsGroups.get(currentGroupId) : null;

  if (!currentMlsGroup || !mlsClientRef.current || !deliveryServiceRef.current) {
    return (
      <div className="min-h-screen bg-black text-white flex">
        <ConnectionStatus deliveryService={deliveryServiceRef.current} />
        <aside className="w-72 border-r border-white/10 h-screen flex flex-col">
          <div className="h-14 border-b border-white/10 px-4 flex items-center">
            <span className="text-sm font-medium">minimum.chat</span>
          </div>
        </aside>
        <main className="flex-1 flex items-center justify-center">
          <p className="text-[13px] text-white/20">Loading group…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex">
      <ConnectionStatus deliveryService={deliveryServiceRef.current} />

      {/* Sidebar */}
      <aside className="w-72 border-r border-white/10 h-screen flex flex-col">
        <div className="h-14 border-b border-white/10 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock size={12} className="text-white/20" />
            <span className="text-sm font-medium">minimum.chat</span>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 text-white/30 hover:text-white transition-colors"
            title="Log out"
          >
            <LogOut size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <GroupManagement
            userId={userId!}
            deviceId={deviceId!}
            mlsClient={mlsClientRef.current}
            onSelectGroup={handleSelectGroup}
          />
        </div>
      </aside>

      {/* Chat area */}
      <main className="flex-1 h-screen overflow-hidden">
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
