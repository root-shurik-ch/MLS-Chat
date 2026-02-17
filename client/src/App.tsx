import React, { useState, useEffect } from 'react';
import RegistrationForm from './components/Auth/RegistrationForm';
import LoginForm from './components/Auth/LoginForm';
import GroupManagement from './components/Group/GroupManagement';
import Chat from './components/Chat/Chat';

type AppView = 'auth' | 'groups' | 'chat';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('auth');
  const [userId, setUserId] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null);

  useEffect(() => {
    // Check for existing session
    const savedUserId = localStorage.getItem('userId');
    if (savedUserId) {
      setUserId(savedUserId);
      setDeviceId(localStorage.getItem('deviceId'));
      setView('groups');
    }
  }, []);

  const handleAuthSuccess = (userId: string, deviceId: string) => {
    setUserId(userId);
    setDeviceId(deviceId);
    setView('groups');
  };

  const handleSelectGroup = (groupId: string) => {
    setCurrentGroupId(groupId);
    setView('chat');
  };

  const handleBackToGroups = () => {
    setCurrentGroupId(null);
    setView('groups');
  };

  const handleLogout = () => {
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
      <div style={{ maxWidth: 600, margin: '0 auto', padding: 20 }}>
        <h1>MLS Chat - Groups</h1>
        <GroupManagement 
          userId={userId!} 
          deviceId={deviceId!}
          onSelectGroup={handleSelectGroup}
        />
        <button onClick={handleLogout} style={{ marginTop: 20 }}>
          Logout
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 20 }}>
      <Chat 
        userId={userId!}
        deviceId={deviceId!}
        groupId={currentGroupId!}
        onBack={handleBackToGroups}
      />
      <button onClick={handleLogout} style={{ marginTop: 20 }}>
        Logout
      </button>
    </div>
  );
};

export default App;
