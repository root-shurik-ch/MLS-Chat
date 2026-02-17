import React, { useState, useEffect, useRef, useCallback } from 'react';
import RegistrationForm from './components/Auth/RegistrationForm';
import LoginForm from './components/Auth/LoginForm';
import GroupManagement from './components/Group/GroupManagement';
import Chat from './components/Chat/Chat';
import ConnectionStatus from './components/ConnectionStatus';
import { MlsClient, MlsGroup } from './mls/index';
import { DeliveryServiceSupabase } from './services/DeliveryServiceSupabase';
import { useToastContext } from './contexts/ToastContext';
import { loadAllMlsGroups, saveMlsGroup } from './utils/mlsGroupStorage';

type AppView = 'auth' | 'groups' | 'chat';

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

      // Connect to WebSocket
      const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:54321/functions/v1/ds_send';
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

  useEffect(() => {
    // Check for existing session
    const savedUserId = localStorage.getItem('userId');
    if (savedUserId) {
      setUserId(savedUserId);
      setDeviceId(localStorage.getItem('deviceId'));
      setView('groups');

      // Initialize services for existing session
      initializeServices(savedUserId, localStorage.getItem('deviceId')!);
    }
  }, [initializeServices]);

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
        // Create new MLS group
        console.log('Creating MLS group:', groupId);
        mlsGroup = await mlsClientRef.current.createGroup(groupId);

        // Save to state and IndexedDB
        const newGroups = new Map(mlsGroups);
        newGroups.set(groupId, mlsGroup);
        setMlsGroups(newGroups);

        // Persist to IndexedDB
        await saveMlsGroup(mlsGroup);
        console.log('MLS group saved to IndexedDB');
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
      toast.error('Failed to open group. Please try again.');
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
    return (
      <div style={{ maxWidth: 400, margin: '0 auto', padding: 20 }}>
        <h1>MLS Chat</h1>
        <RegistrationForm onSuccess={handleAuthSuccess} />
        <LoginForm onSuccess={handleAuthSuccess} />
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
        </div>
      </>
    );
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
