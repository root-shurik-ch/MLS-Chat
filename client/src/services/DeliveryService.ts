import type { AuthToken } from './AuthService';
import type { MsgKind, IncomingMessage, OutgoingMessage } from '../domain/Message';

export interface DeliveryService {
  connect(dsUrl: string, authToken: AuthToken): Promise<void>;

  subscribe(input: {
    userId: string;
    deviceId: string;
    groups: string[];
  }): Promise<void>;

  send(msg: {
    groupId: string;
    senderId: string;
    deviceId: string;
    msgKind: MsgKind;
    mlsBytes: string;
    clientSeq: number;
  }): Promise<void>;

  enqueueOffline(msg: OutgoingMessage): Promise<void>;

  syncOffline(): Promise<void>;

  onDeliver(handler: (msg: IncomingMessage) => void): void;

  disconnect(): Promise<void>;
}

