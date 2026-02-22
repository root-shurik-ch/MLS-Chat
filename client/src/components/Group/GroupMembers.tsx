import React, { useState, useEffect, useCallback } from 'react';
import { senderColor } from '../../utils/senderColor';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'apikey': ANON_KEY,
    'Authorization': `Bearer ${localStorage.getItem('authToken') ?? ANON_KEY}`,
  };
}

interface Member {
  user_id: string;
  avatar_url: string | null;
  is_online: boolean;
  last_seen: string | null;
}

interface PendingInvite {
  invite_id: string;
  status: 'pending' | 'kp_submitted';
  created_at: string;
}

interface GroupMembersProps {
  groupId: string;
  userId: string;
  deviceId: string;
}

export const GroupMembers: React.FC<GroupMembersProps> = ({ groupId, userId, deviceId }) => {
  const [members, setMembers] = useState<Member[]>([]);
  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    if (!SUPABASE_URL) return;
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/group_members_list`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ group_id: groupId, user_id: userId, device_id: deviceId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as any).error ?? 'Failed to load members');
        return;
      }
      const data = await res.json() as { members?: Member[]; pending?: PendingInvite[] };
      setMembers(data.members ?? []);
      setPending(data.pending ?? []);
      setError(null);
    } catch {
      setError('Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [groupId, userId, deviceId]);

  useEffect(() => {
    fetchMembers();
    const interval = setInterval(fetchMembers, 30_000);
    return () => clearInterval(interval);
  }, [fetchMembers]);

  const displayName = (m: Member) => m.user_id.substring(0, 12);

  if (loading) {
    return (
      <div className="space-y-2 px-6 py-5">
        <p className="font-mono text-[10px] text-white/30 uppercase tracking-widest mb-3">Members</p>
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-2.5 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-white/10 shrink-0" />
            <span className="h-2.5 w-24 bg-white/8 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-6 py-5">
        <p className="font-mono text-[10px] text-white/30 uppercase tracking-widest mb-3">Members</p>
        <p className="text-[12px] text-red-400/60">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 px-6 py-5">
      <p className="font-mono text-[10px] text-white/30 uppercase tracking-widest mb-3">
        Members ({members.length})
      </p>

      {members.map(m => (
        <div key={m.user_id} className="flex items-center gap-2.5 py-1">
          <div className="relative shrink-0">
            {m.avatar_url ? (
              <img
                src={m.avatar_url}
                alt={m.user_id}
                className="w-7 h-7 rounded-full object-cover border border-white/10"
              />
            ) : (
              <div
                className="w-7 h-7 rounded-full border border-white/10 flex items-center justify-center text-[11px] font-semibold select-none"
                style={{ backgroundColor: senderColor(m.user_id) + '1a', color: senderColor(m.user_id) }}
              >
                {m.user_id.charAt(0).toUpperCase()}
              </div>
            )}
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-black ${m.is_online ? 'bg-green-400/80' : 'bg-white/20'}`}
              title={m.is_online ? 'Online' : 'Offline'}
            />
          </div>
          <span className="font-mono text-[12px] text-white/60 truncate">
            {m.user_id}
            {m.user_id === userId && (
              <span className="text-white/25 ml-1.5">you</span>
            )}
          </span>
        </div>
      ))}

      {pending.length > 0 && (
        <>
          <p className="font-mono text-[10px] text-white/20 uppercase tracking-widest mt-4 mb-2 pt-3 border-t border-white/6">
            Pending ({pending.length})
          </p>
          {pending.map(inv => (
            <div key={inv.invite_id} className="flex items-center gap-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-white/10 shrink-0 animate-pulse" />
              <span className="font-mono text-[11px] text-white/30">
                {inv.status === 'kp_submitted' ? 'waiting for admin' : 'invited'}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
};

export default GroupMembers;
