import React, { useState, useEffect } from 'react';
import CreateGroupForm from './CreateGroupForm';
import InviteMemberForm from './InviteMemberForm';
import Chat from '../Chat/Chat';
import { GroupMeta } from '../../domain/Group';

const GroupManagement: React.FC = () => {
  const [groups, setGroups] = useState<GroupMeta[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<GroupMeta | null>(null);

  useEffect(() => {
    const storedGroups = JSON.parse(localStorage.getItem('groups') || '[]');
    setGroups(storedGroups);
  }, []);

  const handleOpenChat = (group: GroupMeta) => {
    setSelectedGroup(group);
  };

  const handleBack = () => {
    setSelectedGroup(null);
  };

  if (selectedGroup) {
    return (
      <div>
        <button onClick={handleBack}>Back to Groups</button>
        <Chat groupMeta={selectedGroup} />
      </div>
    );
  }

  return (
    <div>
      <h1>Group Management</h1>
      <CreateGroupForm />
      <h2>Your Groups</h2>
      {groups.map(group => (
        <div key={group.groupId}>
          <h3>{group.name}</h3>
          <button onClick={() => handleOpenChat(group)}>Open Chat</button>
          <InviteMemberForm groupId={group.groupId} />
        </div>
      ))}
    </div>
  );
};

export default GroupManagement;