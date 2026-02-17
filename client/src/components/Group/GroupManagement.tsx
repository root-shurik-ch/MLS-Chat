import React, { useState, useEffect } from 'react';
import CreateGroupForm from './CreateGroupForm';
import InviteMemberForm from './InviteMemberForm';
import { GroupMeta } from '../../domain/Group';

const GroupManagement: React.FC = () => {
  const [groups, setGroups] = useState<GroupMeta[]>([]);

  useEffect(() => {
    const storedGroups = JSON.parse(localStorage.getItem('groups') || '[]');
    setGroups(storedGroups);
  }, []);

  return (
    <div>
      <h1>Group Management</h1>
      <CreateGroupForm />
      <h2>Your Groups</h2>
      {groups.map(group => (
        <div key={group.groupId}>
          <h3>{group.name}</h3>
          <InviteMemberForm groupId={group.groupId} />
        </div>
      ))}
    </div>
  );
};

export default GroupManagement;