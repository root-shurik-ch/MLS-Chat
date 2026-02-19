import React, { useState, useEffect, useCallback } from 'react';
import { GroupMeta } from '../../domain/Group';
import JoinGroup from './JoinGroup';
import CreateGroupForm from './CreateGroupForm';
import { MlsClient } from '../../mls/index';
import { IndexedDBStorage } from '../../utils/storage';

interface GroupManagementProps {
  userId: string;
  deviceId: string;
  mlsClient: MlsClient | null;
  onSelectGroup: (groupId: string) => void;
}

async function loadGroupMetasFromIndexedDB(): Promise<GroupMeta[]> {
  const storage = new IndexedDBStorage('mls-groups', 'groups');
  await storage.init();
  const keys = await storage.getAllKeys();
  const metas: GroupMeta[] = [];
  for (const key of keys) {
    const meta = await storage.get(key);
    if (meta && typeof meta.groupId === 'string' && typeof meta.name === 'string') {
      metas.push(meta as GroupMeta);
    }
  }
  return metas;
}

const GroupManagement: React.FC<GroupManagementProps> = ({
  userId: _userId,
  deviceId: _deviceId,
  mlsClient,
  onSelectGroup
}) => {
  const [groups, setGroups] = useState<GroupMeta[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showJoinForm, setShowJoinForm] = useState(false);

  const loadGroups = useCallback(async () => {
    const fromIndexedDB = await loadGroupMetasFromIndexedDB();
    const fromLocal = JSON.parse(localStorage.getItem('groups') || '[]') as GroupMeta[];
    const byId = new Map<string, GroupMeta>();
    for (const g of fromLocal) {
      if (g?.groupId && g?.name) byId.set(g.groupId, g);
    }
    for (const g of fromIndexedDB) {
      byId.set(g.groupId, g);
    }
    setGroups(Array.from(byId.values()));
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const handleOpenChat = (groupId: string) => {
    onSelectGroup(groupId);
  };

  const handleJoinSuccess = async (groupId: string) => {
    const storedGroups = JSON.parse(localStorage.getItem('groups') || '[]') as GroupMeta[];
    const groupExists = storedGroups.some((g: GroupMeta) => g.groupId === groupId);
    if (!groupExists) {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const dsUrl = import.meta.env.VITE_WS_URL || (supabaseUrl
        ? (() => { const u = new URL(supabaseUrl); return (u.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + u.host + '/functions/v1/ds_send'; })()
        : 'ws://localhost:54321/functions/v1/ds_send');
      storedGroups.push({
        groupId,
        name: `Group ${groupId.substring(0, 8)}`,
        dsUrl,
        currentEpoch: 0,
      });
      localStorage.setItem('groups', JSON.stringify(storedGroups));
    }

    setShowJoinForm(false);
    await loadGroups();
    onSelectGroup(groupId);
  };

  return (
    <div>
      <h2>Groups</h2>

      {/* Join Group Form */}
      {mlsClient && showJoinForm && (
        <div style={{ marginBottom: 20 }}>
          <JoinGroup mlsClient={mlsClient} onJoinSuccess={handleJoinSuccess} />
          <button onClick={() => setShowJoinForm(false)} style={{ marginTop: 10 }}>
            Cancel
          </button>
        </div>
      )}

      {/* Create/Join Buttons */}
      {!showCreateForm && !showJoinForm && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <button onClick={() => setShowCreateForm(true)}>Create Group</button>
          {mlsClient && (
            <button onClick={() => setShowJoinForm(true)} style={{ background: '#28a745' }}>
              Join Group
            </button>
          )}
        </div>
      )}

      {/* Create Form: full flow (MLS + group_create API + IndexedDB) so sending messages works */}
      {showCreateForm && (
        <div style={{ marginBottom: 20 }}>
          <CreateGroupForm />
          <button onClick={() => setShowCreateForm(false)} style={{ marginTop: 10 }}>
            Cancel
          </button>
        </div>
      )}

      <div>
        {groups.length === 0 ? (
          <p>No groups yet</p>
        ) : (
          groups.map(group => (
            <div 
              key={group.groupId} 
              style={{ 
                padding: 10, 
                margin: '5px 0', 
                background: '#f5f5f5',
                borderRadius: 4,
                cursor: 'pointer'
              }}
              onClick={() => handleOpenChat(group.groupId)}
            >
              <strong>{group.name}</strong>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default GroupManagement;
