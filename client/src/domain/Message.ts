export type MsgKind = 'handshake' | 'chat' | 'control';

export interface OutgoingMessage {
  groupId: string;
  senderId: string;
  deviceId: string;
  msgKind: MsgKind;
  mlsBytes: string;   // base64
  clientSeq: number;
}

export interface IncomingMessage {
  groupId: string;
  serverSeq: number;
  serverTime: number; // epoch ms
  senderId: string;
  deviceId: string;
  msgKind: MsgKind;
  mlsBytes: string;   // base64
}

