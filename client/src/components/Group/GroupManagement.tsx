import React, { useState, useEffect, useCallback } from 'react';
import { GroupMeta } from '../../domain/Group';
import JoinGroup from './JoinGroup';
import CreateGroupForm from './CreateGroupForm';
import { MlsClient } from '../../mls/index';
import { IndexedDBStorage } from '../../utils/storage';
import { Plus, LogIn } from 'lucide-react';
import { Button } from '../ui/Button';

interface GroupManagementProps {
  userId: string;
  deviceId: string;
  mlsClient: MlsClient | null;
  onSelectGroup: (groupId: string) => void;
  onGroupCreated?: () => void;
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
  onSelectGroup,
  onGroupCreated,
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

  const handleGroupCreated = async () => {
    setShowCreateForm(false);
    await loadGroups();
    onGroupCreated?.();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Group list */}
      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[13px] text-white/20">No groups yet</p>
          </div>
        ) : (
          groups.map(group => (
            <div
              key={group.groupId}
              className="flex items-center justify-between px-4 py-4 hover:bg-white/5 cursor-pointer transition-all border-b border-white/5"
              onClick={() => onSelectGroup(group.groupId)}
            >
              <span className="text-sm font-medium">{group.name}</span>
              <span className="font-mono text-[10px] text-white/20">{group.groupId.substring(0, 6)}</span>
            </div>
          ))
        )}
      </div>

      {/* Create/Join forms */}
      {showCreateForm && (
        <div className="border-t border-white/10 p-4">
          <CreateGroupForm mlsClient={mlsClient} onSuccess={handleGroupCreated} />
          <button
            onClick={() => setShowCreateForm(false)}
            className="mt-3 text-[12px] text-white/30 hover:text-white/60 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {showJoinForm && mlsClient && (
        <div className="border-t border-white/10 p-4">
          <JoinGroup mlsClient={mlsClient} onJoinSuccess={handleJoinSuccess} />
          <button
            onClick={() => setShowJoinForm(false)}
            className="mt-3 text-[12px] text-white/30 hover:text-white/60 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Action buttons */}
      {!showCreateForm && !showJoinForm && (
        <div className="border-t border-white/10 p-4 flex gap-3">
          <Button
            variant="ghost"
            onClick={() => setShowCreateForm(true)}
            className="flex-1 flex items-center justify-center gap-2 py-2"
          >
            <Plus size={14} />
            <span className="text-[13px]">New</span>
          </Button>
          {mlsClient && (
            <Button
              variant="ghost"
              onClick={() => setShowJoinForm(true)}
              className="flex-1 flex items-center justify-center gap-2 py-2"
            >
              <LogIn size={14} />
              <span className="text-[13px]">Join</span>
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default GroupManagement;
