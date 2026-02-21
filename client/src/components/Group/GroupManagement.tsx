import React, { useState, useEffect, useCallback } from 'react';
import { GroupMeta } from '../../domain/Group';
import JoinGroup from './JoinGroup';
import CreateGroupForm from './CreateGroupForm';
import { MlsClient } from '../../mls/index';
import { IndexedDBStorage } from '../../utils/storage';
import { deleteMlsGroup, loadAllMlsGroups } from '../../utils/mlsGroupStorage';
import { Plus, LogIn, Trash2 } from 'lucide-react';
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

async function fetchServerGroups(userId: string, deviceId: string): Promise<GroupMeta[]> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
  const authToken = localStorage.getItem('authToken') ?? anonKey;
  if (!supabaseUrl || !userId || !deviceId) return [];
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/user_groups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({ user_id: userId, device_id: deviceId }),
    });
    if (!res.ok) return [];
    const data = await res.json() as { groups?: Array<{ group_id: string; name: string; avatar_url?: string | null; ds_url: string }> };
    return (data.groups ?? []).map((g) => ({
      groupId: g.group_id,
      name: g.name,
      avatarUrl: g.avatar_url ?? undefined,
      dsUrl: g.ds_url,
      currentEpoch: 0,
    }));
  } catch {
    return [];
  }
}

const GroupManagement: React.FC<GroupManagementProps> = ({
  userId,
  deviceId,
  mlsClient,
  onSelectGroup,
  onGroupCreated,
}) => {
  const [groups, setGroups] = useState<GroupMeta[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    // Fetch from server (source of truth for group membership)
    const serverGroups = await fetchServerGroups(userId, deviceId);

    // Also load from IndexedDB as offline fallback
    const fromIndexedDB = await loadGroupMetasFromIndexedDB();

    // Server takes priority; merge with IndexedDB for offline fallback
    const byId = new Map<string, GroupMeta>();
    for (const g of fromIndexedDB) {
      if (g?.groupId && g?.name) byId.set(g.groupId, g);
    }
    for (const g of serverGroups) {
      byId.set(g.groupId, g);
    }

    // Persist server groups to IndexedDB for offline access
    if (serverGroups.length > 0) {
      const storage = new IndexedDBStorage('mls-groups', 'groups');
      await storage.init();
      for (const g of serverGroups) {
        await storage.set(g.groupId, g);
      }
    }

    setGroups(Array.from(byId.values()));
  }, [userId, deviceId]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const handleJoinSuccess = async (groupId: string) => {
    setShowJoinForm(false);
    await loadGroups();
    onSelectGroup(groupId);
  };

  const handleGroupCreated = async () => {
    setShowCreateForm(false);
    await loadGroups();
    onGroupCreated?.();
  };

  const handleDeleteGroup = async (groupId: string) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
    const authToken = localStorage.getItem('authToken') ?? anonKey;
    if (!supabaseUrl) return;

    setDeletingGroupId(groupId);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/group_delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ group_id: groupId, user_id: userId, device_id: deviceId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        console.error('[GroupManagement] Delete group failed:', data.error ?? res.status);
        return;
      }

      // Remove from local IndexedDB storage
      const storage = new IndexedDBStorage('mls-groups', 'groups');
      await storage.init();
      await storage.delete(groupId);

      // Remove WASM group state
      const allMlsGroups = await loadAllMlsGroups();
      const mlsGroup = allMlsGroups.find(g => g.groupId === groupId);
      if (mlsGroup) {
        await deleteMlsGroup(mlsGroup.id).catch(() => {});
      }

      await loadGroups();
    } finally {
      setDeletingGroupId(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Group list */}
      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="font-mono text-[11px] text-white/20 uppercase tracking-widest">No groups</p>
          </div>
        ) : (
          groups.map(group => (
            <div
              key={group.groupId}
              className="group flex items-center justify-between px-5 py-3.5 hover:bg-white/5 cursor-pointer transition-colors border-b border-white/5"
              onClick={() => onSelectGroup(group.groupId)}
            >
              <span className="text-[14px] font-medium text-white/80 group-hover:text-white transition-colors truncate">
                {group.name}
              </span>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <span className="font-mono text-[10px] text-white/20">{group.groupId.substring(0, 6)}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.groupId); }}
                  disabled={deletingGroupId === group.groupId}
                  className="p-1 text-white/20 hover:text-white/50 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-20"
                  title="Delete group"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create/Join forms */}
      {showCreateForm && (
        <div className="border-t border-white/10 p-4 animate-fade-in">
          <CreateGroupForm mlsClient={mlsClient} onSuccess={handleGroupCreated} />
          <button
            onClick={() => setShowCreateForm(false)}
            className="mt-3 font-mono text-[11px] text-white/25 hover:text-white/50 transition-colors uppercase tracking-widest"
          >
            cancel
          </button>
        </div>
      )}

      {showJoinForm && mlsClient && (
        <div className="border-t border-white/10 p-4 animate-fade-in">
          <JoinGroup mlsClient={mlsClient} onJoinSuccess={handleJoinSuccess} />
          <button
            onClick={() => setShowJoinForm(false)}
            className="mt-3 font-mono text-[11px] text-white/25 hover:text-white/50 transition-colors uppercase tracking-widest"
          >
            cancel
          </button>
        </div>
      )}

      {/* Action buttons */}
      {!showCreateForm && !showJoinForm && (
        <div className="border-t border-white/10 p-3 flex gap-2">
          <Button
            variant="ghost"
            onClick={() => setShowCreateForm(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px]"
          >
            <Plus size={12} />
            New
          </Button>
          {mlsClient && (
            <Button
              variant="ghost"
              onClick={() => setShowJoinForm(true)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px]"
            >
              <LogIn size={12} />
              Join
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default GroupManagement;
