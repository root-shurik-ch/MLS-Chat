import React, { useState, useRef, useCallback } from 'react';
import RegistrationForm from './components/Auth/RegistrationForm';
import LoginForm from './components/Auth/LoginForm';
import GroupManagement from './components/Group/GroupManagement';
import Chat from './components/Chat/Chat';
import ConnectionStatus from './components/ConnectionStatus';
import { MlsClient, MlsGroup } from './mls/index';
import { DeliveryServiceSupabase } from './services/DeliveryServiceSupabase';
import { useToastContext } from './contexts/ToastContext';
import { loadAllMlsGroups, loadMlsGroup, saveMlsGroup } from './utils/mlsGroupStorage';
import UIShowcase from './pages/UIShowcase';

type AppView = 'auth' | 'groups' | 'chat' | 'ui';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('auth');
  const [userId, setUserId] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null);

  // MLS and WebSocket services
  const mlsClientRef = useRef<MlsClient | null>(null);
  const deliveryServiceRef = useRef<DeliveryServiceSupabase | null>(null);
  const [mlsGroups, setMlsGroups] = useState<Map<string, MlsGroup>>(new Map());
  const [isConnecting, setIsConnecting] = useState(false);

  // Toast notifications
  const toast = useToastContext();

  const initializeServices = useCallback(async (userId: string, _deviceId: string) => {
    try {
      setIsConnecting(true);

      // Initialize MLS client
      if (!mlsClientRef.current) {
        mlsClientRef.current = new MlsClient(userId);
      }

      // Initialize delivery service
      if (!deliveryServiceRef.current) {
        deliveryServiceRef.current = new DeliveryServiceSupabase();
      }

      // Connect to WebSocket (use Supabase host when VITE_WS_URL not set, so production works)
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const wsUrl = import.meta.env.VITE_WS_URL || (supabaseUrl
        ? (() => {
            const u = new URL(supabaseUrl);
            return (u.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + u.host + '/functions/v1/ds_send';
          })()
        : 'ws://localhost:54321/functions/v1/ds_send');
      const authToken = {
        value: localStorage.getItem('authToken') || `temp_token_${userId}`,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
      };

      await deliveryServiceRef.current.connect(wsUrl, authToken);

      // Load saved MLS groups from IndexedDB
      console.log('Loading saved MLS groups...');
      const savedGroups = await loadAllMlsGroups();
      if (savedGroups.length > 0) {
        const groupsMap = new Map<string, MlsGroup>();
        savedGroups.forEach(group => {
          groupsMap.set(group.groupId, group);
        });
        setMlsGroups(groupsMap);
        console.log(`Loaded ${savedGroups.length} MLS groups from storage`);
      }

      console.log('Services initialized successfully');
      toast.success('Connected to server');
    } catch (error) {
      console.error('Failed to initialize services:', error);
      toast.error('Failed to connect to server. Please try again.');
    } finally {
      setIsConnecting(false);
    }
  }, []);

  // Do not auto-redirect to groups: show auth first so Register/Login always run (passkey requested).
  // User with saved session can click "Continue with saved session" to restore.

  const handleAuthSuccess = async (userId: string, deviceId: string) => {
    setUserId(userId);
    setDeviceId(deviceId);
    setView('groups');

    // Initialize services after successful auth
    await initializeServices(userId, deviceId);
  };

  const handleSelectGroup = async (groupId: string) => {
    try {
      // Check if MLS group already exists
      let mlsGroup = mlsGroups.get(groupId);

      if (!mlsGroup && mlsClientRef.current) {
        const loaded = await loadMlsGroup(groupId);
        if (loaded) {
          mlsGroup = loaded;
          const newGroups = new Map(mlsGroups);
          newGroups.set(groupId, mlsGroup);
          setMlsGroups(newGroups);
        }
        if (!mlsGroup) {
          console.log('Creating MLS group:', groupId);
          mlsGroup = await mlsClientRef.current.createGroup(groupId);
          const newGroups = new Map(mlsGroups);
          newGroups.set(groupId, mlsGroup);
          setMlsGroups(newGroups);
          await saveMlsGroup(mlsGroup);
        }
      }

      if (mlsGroup && deliveryServiceRef.current) {
        // Subscribe to group
        await deliveryServiceRef.current.subscribe({
          userId: userId!,
          deviceId: deviceId!,
          groups: [groupId]
        });
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
    // Disconnect services
    if (deliveryServiceRef.current) {
      deliveryServiceRef.current.disconnect();
      deliveryServiceRef.current = null;
    }

    mlsClientRef.current = null;
    setMlsGroups(new Map());

    localStorage.clear();
    setUserId(null);
    setDeviceId(null);
    setCurrentGroupId(null);
    setView('auth');
  };

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
      <div style={{ maxWidth: 400, margin: '0 auto', padding: 20 }}>
        <h1>MLS Chat</h1>
        {hasSavedSession && (
          <div style={{ marginBottom: 16, padding: 12, background: '#e7f3ff', borderRadius: 8 }}>
            <p style={{ margin: '0 0 8px 0' }}>You have a saved session.</p>
            <button type="button" onClick={handleContinueSession} style={{ marginRight: 8 }}>
              Continue to Groups
            </button>
            <button type="button" onClick={handleLogout}>
              Log out and Register / Sign in again
            </button>
          </div>
        )}
        <RegistrationForm onSuccess={handleAuthSuccess} />
        <LoginForm onSuccess={handleAuthSuccess} />
        <div style={{ marginTop: 12 }}>
          <button onClick={() => setView('ui')} style={{ padding: '8px 12px', borderRadius: 4, border: '1px solid #555', background: '#111', color: '#fff' }}>
            UI Showcase
          </button>
        </div>
        <p style={{ marginTop: 24, fontSize: 12, color: '#888' }}>v{__APP_VERSION__}</p>
      </div>
    );
  }

  if (view === 'groups') {
    return (
      <>
        <ConnectionStatus deliveryService={deliveryServiceRef.current} />
        <div style={{ maxWidth: 600, margin: '0 auto', padding: 20 }}>
          <h1>MLS Chat - Groups</h1>
          {isConnecting && (
            <div style={{ padding: 10, background: '#fff3cd', borderRadius: 4, marginBottom: 10 }}>
              Connecting to server...
            </div>
          )}
          <GroupManagement
            userId={userId!}
            deviceId={deviceId!}
            mlsClient={mlsClientRef.current}
            onSelectGroup={handleSelectGroup}
          />
          <button onClick={handleLogout} style={{ marginTop: 20 }}>
            Logout
          </button>
          <p style={{ marginTop: 16, fontSize: 12, color: '#888' }}>v{__APP_VERSION__}</p>
        </div>
      </>
    );
  }

  // UI Showcase route for design system verification
  if (view === 'ui') {
    return <UIShowcase />;
  }

  // Chat view
  const currentMlsGroup = currentGroupId ? mlsGroups.get(currentGroupId) : null;

  if (!currentMlsGroup || !mlsClientRef.current || !deliveryServiceRef.current) {
    return (
      <>
        <ConnectionStatus deliveryService={deliveryServiceRef.current} />
        <div style={{ maxWidth: 800, margin: '0 auto', padding: 20 }}>
          <h1>Loading group...</h1>
          <button onClick={handleBackToGroups}>← Back to Groups</button>
        </div>
      </>
    );
  }

  return (
    <>
      <ConnectionStatus deliveryService={deliveryServiceRef.current} />
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Chat
          userId={userId!}
          deviceId={deviceId!}
          groupId={currentGroupId!}
          mlsGroup={currentMlsGroup}
          mlsClient={mlsClientRef.current}
          deliveryService={deliveryServiceRef.current}
          onBack={handleBackToGroups}
        />
      </div>
    </>
  );
};

export default App;
