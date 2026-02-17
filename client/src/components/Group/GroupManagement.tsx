import React, { useState, useEffect } from 'react';
import { GroupMeta } from '../../domain/Group';

interface GroupManagementProps {
  userId: string;
  deviceId: string;
  onSelectGroup: (groupId: string) => void;
}

const GroupManagement: React.FC<GroupManagementProps> = ({ 
  userId, 
  deviceId, 
  onSelectGroup 
}) => {
  const [groups, setGroups] = useState<GroupMeta[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
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
      dsUrl: 'ws://localhost:3000',
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

  return (
    <div>
      <h2>Groups</h2>
      
      {!showCreateForm ? (
        <button onClick={() => setShowCreateForm(true)}>Create Group</button>
      ) : (
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
