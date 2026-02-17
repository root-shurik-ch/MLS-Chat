import React, { useState, useEffect } from 'react';
import { GroupMeta } from '../../domain/Group';
import JoinGroup from './JoinGroup';
import { MlsClient } from '../../mls/index';

interface GroupManagementProps {
  userId: string;
  deviceId: string;
  mlsClient: MlsClient | null;
  onSelectGroup: (groupId: string) => void;
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
  const [newGroupName, setNewGroupName] = useState('');

  useEffect(() => {
    const storedGroups = JSON.parse(localStorage.getItem('groups') || '[]');
    setGroups(storedGroups);
  }, []);

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return;

    const newGroup: GroupMeta = {
      groupId: 'group_' + Date.now(),
      name: newGroupName,
      dsUrl: 'ws://localhost:54321/functions/v1/ds_send',
      currentEpoch: 0,
    };

    const updatedGroups = [...groups, newGroup];
    setGroups(updatedGroups);
    localStorage.setItem('groups', JSON.stringify(updatedGroups));
    
    setNewGroupName('');
    setShowCreateForm(false);
  };

  const handleOpenChat = (groupId: string) => {
    onSelectGroup(groupId);
  };

  const handleJoinSuccess = (groupId: string) => {
    // Reload groups from localStorage
    const storedGroups = JSON.parse(localStorage.getItem('groups') || '[]');

    // Add the joined group if not already present
    const groupExists = storedGroups.some((g: GroupMeta) => g.groupId === groupId);
    if (!groupExists) {
      storedGroups.push({
        groupId,
        name: `Group ${groupId.substring(0, 8)}`,
        dsUrl: 'ws://localhost:54321/functions/v1/ds_send',
        currentEpoch: 0,
      });
      localStorage.setItem('groups', JSON.stringify(storedGroups));
    }

    setGroups(storedGroups);
    setShowJoinForm(false);

    // Automatically open the joined group
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

      {/* Create Form */}
      {showCreateForm && (
        <div style={{ marginBottom: 20 }}>
          <input
            type="text"
            placeholder="Group Name"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            style={{ width: '100%', padding: 8, marginBottom: 10 }}
          />
          <button onClick={handleCreateGroup}>Create</button>
          <button onClick={() => setShowCreateForm(false)}>Cancel</button>
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
