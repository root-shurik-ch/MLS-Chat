import React, { useState, useEffect, useCallback } from 'react';
import { GroupMeta } from '../../domain/Group';
import CreateGroupForm from './CreateGroupForm';
import { MlsClient } from '../../mls/index';
import { IndexedDBStorage } from '../../utils/storage';
import { deleteMlsGroup, loadAllMlsGroups } from '../../utils/mlsGroupStorage';
import { Plus, Trash2 } from 'lucide-react';
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
    <div className="flex flex-col h-full min-h-0">
      {/* Group list — scrollable, with iOS scroll momentum */}
      <div className="flex-1 overflow-y-auto min-h-0" style={{ WebkitOverflowScrolling: 'touch' }}>
        {groups.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="font-mono text-[11px] text-white/20 uppercase tracking-widest">No groups</p>
          </div>
        ) : (
          groups.map(group => (
            <div
              key={group.groupId}
              className="group flex items-center justify-between px-5 hover:bg-white/5 active:bg-white/[0.08] cursor-pointer transition-colors border-b border-white/5"
              style={{ minHeight: '52px' }}  /* ≥44px touch target */
              onClick={() => onSelectGroup(group.groupId)}
            >
              <span className="text-[15px] font-medium text-white/80 group-hover:text-white transition-colors truncate py-3.5">
                {group.name}
              </span>
              <div className="flex items-center gap-1 shrink-0 ml-2">
                <span className="font-mono text-[10px] text-white/18 hidden sm:inline">
                  {group.groupId.substring(0, 6)}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.groupId); }}
                  disabled={deletingGroupId === group.groupId}
                  className="p-2.5 text-white/20 hover:text-white/50 active:text-white/70 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-20"
                  title="Delete group"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create/Join forms */}
      {showCreateForm && (
        <div className="border-t border-white/8 p-4 animate-fade-in">
          <CreateGroupForm mlsClient={mlsClient} onSuccess={handleGroupCreated} />
          <button
            onClick={() => setShowCreateForm(false)}
            className="mt-3 font-mono text-[11px] text-white/25 hover:text-white/50 transition-colors uppercase tracking-widest"
          >
            cancel
          </button>
        </div>
      )}

      {/* Action buttons — safe area bottom for iOS */}
      {!showCreateForm && (
        <div
          className="border-t border-white/8 px-3 pt-2.5 flex gap-2"
          style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}
        >
          <Button
            variant="ghost"
            onClick={() => setShowCreateForm(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 text-[13px]"
          >
            <Plus size={13} />
            New group
          </Button>
        </div>
      )}
    </div>
  );
};

export default GroupManagement;
