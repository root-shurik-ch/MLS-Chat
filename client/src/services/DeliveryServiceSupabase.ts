import type { AuthToken } from './AuthService';
import type { MsgKind, IncomingMessage, OutgoingMessage } from '../domain/Message';
import type { DeliveryService } from './DeliveryService';
import { saveToQueue, getQueue, removeFromQueue, QueuedMessage } from '../utils/offlineQueue';

export class DeliveryServiceSupabase implements DeliveryService {
  private ws: WebSocket | null = null;
  private authToken: AuthToken | null = null;
  private deliverHandler: ((msg: IncomingMessage) => void) | null = null;

  async connect(dsUrl: string, authToken: AuthToken): Promise<void> {
    this.authToken = authToken;
    this.ws = new WebSocket(dsUrl);

    return new Promise((resolve, reject) => {
      if (!this.ws) return reject(new Error("WebSocket not created"));

      this.ws.onopen = () => {
        console.log("WebSocket connected");
        resolve();
      };

      this.ws.onerror = (error) => {
        console.error("WebSocket error", error);
        reject(error);
      };

      this.ws.onclose = () => {
        console.log("WebSocket closed");
        this.ws = null;
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "deliver" && this.deliverHandler) {
            this.deliverHandler(data as IncomingMessage);
          } else if (data.error) {
            console.error("DS error:", data.error);
          }
        } catch (e) {
          console.error("Invalid message", e);
        }
      };
    });
  }

  async subscribe(input: { userId: string; deviceId: string; groups: string[] }): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error("Not connected");
    if (!this.authToken) throw new Error("No auth token");

    this.ws.send(JSON.stringify({
      type: "subscribe",
      user_id: input.userId,
      device_id: input.deviceId,
      groups: input.groups,
      auth: this.authToken.value,
    }));

    // Wait for "subscribed" response
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Subscribe timeout")), 5000);
      const originalOnMessage = this.ws!.onmessage;
      this.ws!.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "subscribed") {
            clearTimeout(timeout);
            this.ws!.onmessage = originalOnMessage;
            this.syncOffline(); // Sync offline messages after subscribe
            resolve();
          } else if (data.error) {
            clearTimeout(timeout);
            reject(new Error(data.error));
          }
        } catch (e) {
          console.error("Invalid message", e);
        }
      };
    });
  }

  async send(msg: {
    groupId: string;
    senderId: string;
    deviceId: string;
    msgKind: MsgKind;
    mlsBytes: string;
    clientSeq: number;
  }): Promise<void> {
    if (navigator.onLine && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: "send",
        group_id: msg.groupId,
        sender_id: msg.senderId,
        device_id: msg.deviceId,
        msg_kind: msg.msgKind,
        mls_bytes: msg.mlsBytes,
        client_seq: msg.clientSeq,
      }));
    } else {
      await this.enqueueOffline({
        groupId: msg.groupId,
        senderId: msg.senderId,
        deviceId: msg.deviceId,
        msgKind: msg.msgKind,
        mlsBytes: msg.mlsBytes,
        clientSeq: msg.clientSeq,
      });
    }
  }

  onDeliver(handler: (msg: IncomingMessage) => void): void {
    this.deliverHandler = handler;
  }

  async disconnect(): Promise<void> {
    this.ws?.close();
    this.ws = null;
    this.authToken = null;
    this.deliverHandler = null;
  }

  async enqueueOffline(msg: OutgoingMessage): Promise<void> {
    await saveToQueue(msg);
  }

  async syncOffline(): Promise<void> {
    if (!navigator.onLine || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const queue: QueuedMessage[] = await getQueue();
    for (const msg of queue) {
      try {
        this.ws.send(JSON.stringify({
          type: "send",
          group_id: msg.groupId,
          sender_id: msg.senderId,
          device_id: msg.deviceId,
          msg_kind: msg.msgKind,
          mls_bytes: msg.mlsBytes,
          client_seq: msg.clientSeq,
        }));
        // Assuming success, remove from queue
        await removeFromQueue(msg.id);
      } catch (e) {
        console.error('Failed to send queued message:', e);
      }
    }
  }
}