import type { AuthToken } from './AuthService';
import type { MsgKind, IncomingMessage } from '../domain/Message';
import type { DeliveryService } from './DeliveryService';

export class DeliveryServiceSupabase implements DeliveryService {
  private ws: WebSocket | null = null;
  private offlineQueue: any[] = [];

  async connect(dsUrl: string, authToken: AuthToken): Promise<void> {
    this.ws = new WebSocket(dsUrl);
    // Setup listeners
  }

  async subscribe(input: { userId: string; deviceId: string; groups: string[] }): Promise<void> {
    if (!this.ws) throw new Error("Not connected");
    this.ws.send(JSON.stringify({
      type: "subscribe",
      user_id: input.userId,
      device_id: input.deviceId,
      groups: input.groups,
      auth: authToken.value,
    }));
  }

  async send(msg: {
    groupId: string;
    senderId: string;
    deviceId: string;
    msgKind: MsgKind;
    mlsBytes: string;
    clientSeq: number;
  }): Promise<void> {
    if (navigator.onLine && this.ws) {
      this.ws.send(JSON.stringify({
        type: "send",
        ...msg,
      }));
    } else {
      this.enqueueOffline(msg);
    }
  }

  onDeliver(handler: (msg: IncomingMessage) => void): void {
    if (!this.ws) return;
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "deliver") {
        handler(data);
      }
    };
  }

  async disconnect(): Promise<void> {
    this.ws?.close();
    this.ws = null;
  }

  private enqueueOffline(msg: any): void {
    this.offlineQueue.push(msg);
    // Store in IndexedDB
  }

  async syncOffline(): Promise<void> {
    if (!navigator.onLine || !this.ws) return;
    for (const msg of this.offlineQueue) {
      await this.send(msg);
    }
    this.offlineQueue = [];
    // Clear IndexedDB
  }
}