export interface GroupMeta {
  groupId: string;   // UUID
  name: string;
  avatarUrl?: string;
  dsUrl: string;     // DeliveryService endpoint for this group
  currentEpoch: number;
}

export type GroupRole = 'member' | 'admin';

export interface GroupMember {
  userId: string;
  deviceId: string;
  role: GroupRole;
}

