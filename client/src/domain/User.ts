export interface UserProfile {
  userId: string;       // stable id, e.g. hash of MLS public key
  displayName: string;
  avatarUrl?: string;
}
