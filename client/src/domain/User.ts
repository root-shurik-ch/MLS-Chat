export interface UserProfile {
  userId: string;       // stable id, e.g. hash of MLS public key
  displayName: string;
  avatarUrl?: string;
}

export interface UserAuthData {
  userId: string;
  mlsPublicKey: string;     // base64 MLS identity public key
  mlsPrivateKeyEnc: string; // base64 encrypted MLS identity private key
  deviceId: string;
}
