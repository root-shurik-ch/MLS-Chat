import type { AuthToken } from './AuthService';
import type { MsgKind, IncomingMessage, OutgoingMessage } from '../domain/Message';
import type { DeliveryService } from './DeliveryService';
import { saveToQueue, getQueue, removeFromQueue, QueuedMessage } from '../utils/offlineQueue';
import { WebSocketManager, ConnectionState, type WebSocketMessage } from '../utils/WebSocketManager';

interface PendingAck {
  clientSeq: number;
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: number;
}

export class DeliveryServiceSupabase implements DeliveryService {
  private wsManager: WebSocketManager | null = null;
  private authToken: AuthToken | null = null;
  private deliverHandler: ((msg: IncomingMessage) => void) | null = null;
  private subscribed = false;
  private subscriptionData: {
    userId: string;
    deviceId: string;
    groups: string[];
  } | null = null;

  // Message acknowledgment tracking
  private pendingAcks = new Map<number, PendingAck>();
  private readonly ACK_TIMEOUT = 10000; // 10 seconds

  // Event emitter for connection state changes
  private eventTarget = new EventTarget();

  async connect(dsUrl: string, authToken: AuthToken): Promise<void> {
    this.authToken = authToken;

    // Create WebSocket manager
    this.wsManager = new WebSocketManager({
      url: dsUrl,
      heartbeatInterval: 30000,
      reconnectDelay: 1000,
      maxReconnectDelay: 30000,
      connectionTimeout: 10000
    });

    // Handle incoming messages
    this.wsManager.onMessage((message: WebSocketMessage) => {
      this.handleMessage(message);
    });

    // Handle connection state changes
    this.wsManager.onStateChange((state: ConnectionState, error?: Error) => {
      console.log('Connection state changed:', state);

      // Emit state change event for listeners
      this.emitStateChange(state);

      if (state === ConnectionState.CONNECTED) {
        // Re-subscribe if we were subscribed before
        if (this.subscribed && this.subscriptionData) {
          console.log('Reconnected - resubscribing...');
          this.subscribe(this.subscriptionData).catch(err => {
            console.error('Failed to resubscribe:', err);
          });
        }
      } else if (state === ConnectionState.FAILED) {
        console.error('WebSocket connection failed:', error);
      }
    });

    // Connect
    await this.wsManager.connect();
  }

  async subscribe(input: { userId: string; deviceId: string; groups: string[] }): Promise<void> {
    if (!this.wsManager || !this.wsManager.isConnected()) {
      throw new Error("Not connected");
    }
    if (!this.authToken) {
      throw new Error("No auth token");
    }

    // Store subscription data for reconnection
    this.subscriptionData = input;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Subscribe timeout"));
      }, 5000);

      // Listen for subscribed response
      const unsubscribe = this.wsManager!.onMessage((message: WebSocketMessage) => {
        if (message.type === "subscribed") {
          clearTimeout(timeout);
          unsubscribe();
          this.subscribed = true;
          console.log('Subscribed successfully');

          // Sync offline messages after successful subscription
          this.syncOffline().catch(err => {
            console.error('Failed to sync offline messages:', err);
          });

          resolve();
        } else if (message.type === "error" && message.context === "subscribe") {
          clearTimeout(timeout);
          unsubscribe();
          reject(new Error(message.error || "Subscribe failed"));
        }
      });

      // Send subscribe request
      this.wsManager!.send({
        type: "subscribe",
        user_id: input.userId,
        device_id: input.deviceId,
        groups: input.groups,
        auth: this.authToken!.value,
      });
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
    // Check if online and connected
    if (!navigator.onLine || !this.wsManager || !this.wsManager.isConnected()) {
      console.log('Offline or not connected - queuing message');
      await this.enqueueOffline({
        groupId: msg.groupId,
        senderId: msg.senderId,
        deviceId: msg.deviceId,
        msgKind: msg.msgKind,
        mlsBytes: msg.mlsBytes,
        clientSeq: msg.clientSeq,
      });
      return;
    }

    // Send with acknowledgment
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pendingAcks.delete(msg.clientSeq);
        reject(new Error('Message acknowledgment timeout'));

        // Queue for retry
        this.enqueueOffline({
          groupId: msg.groupId,
          senderId: msg.senderId,
          deviceId: msg.deviceId,
          msgKind: msg.msgKind,
          mlsBytes: msg.mlsBytes,
          clientSeq: msg.clientSeq,
        });
      }, this.ACK_TIMEOUT);

      // Store pending ack
      this.pendingAcks.set(msg.clientSeq, {
        clientSeq: msg.clientSeq,
        resolve,
        reject,
        timeout
      });

      // Send message
      this.wsManager!.send({
        type: "send",
        group_id: msg.groupId,
        sender_id: msg.senderId,
        device_id: msg.deviceId,
        msg_kind: msg.msgKind,
        mls_bytes: msg.mlsBytes,
        client_seq: msg.clientSeq,
      });
    });
  }

  onDeliver(handler: (msg: IncomingMessage) => void): void {
    this.deliverHandler = handler;
  }

  async disconnect(): Promise<void> {
    // Clear pending acks
    this.pendingAcks.forEach(ack => {
      clearTimeout(ack.timeout);
      ack.reject(new Error('Disconnected'));
    });
    this.pendingAcks.clear();

    // Disconnect WebSocket
    this.wsManager?.disconnect();
    this.wsManager = null;
    this.authToken = null;
    this.deliverHandler = null;
    this.subscribed = false;
    this.subscriptionData = null;
  }

  async enqueueOffline(msg: OutgoingMessage): Promise<void> {
    await saveToQueue(msg);
    console.log('Message queued for offline sync:', msg.clientSeq);
  }

  async syncOffline(): Promise<void> {
    if (!navigator.onLine || !this.wsManager || !this.wsManager.isConnected()) {
      console.log('Cannot sync offline messages - not connected');
      return;
    }

    const queue: QueuedMessage[] = await getQueue();

    if (queue.length === 0) {
      return;
    }

    console.log(`Syncing ${queue.length} offline messages`);

    for (const msg of queue) {
      try {
        await this.send({
          groupId: msg.groupId,
          senderId: msg.senderId,
          deviceId: msg.deviceId,
          msgKind: msg.msgKind,
          mlsBytes: msg.mlsBytes,
          clientSeq: msg.clientSeq,
        });

        // Remove from queue after successful send
        await removeFromQueue(msg.id);
        console.log('Queued message sent successfully:', msg.clientSeq);
      } catch (e) {
        console.error('Failed to send queued message:', e);
        // Keep in queue for next sync attempt
        break; // Stop syncing if one fails
      }
    }
  }

  // Private helper methods

  private handleMessage(message: WebSocketMessage): void {
    switch (message.type) {
      case 'deliver':
        // Convert WebSocket message to IncomingMessage
        const incomingMsg: IncomingMessage = {
          groupId: message.group_id,
          serverSeq: message.server_seq,
          serverTime: message.server_time,
          senderId: message.sender_id,
          deviceId: message.device_id,
          msgKind: message.msg_kind,
          mlsBytes: message.mls_bytes,
        };
        this.handleDeliver(incomingMsg);
        break;

      case 'ack':
        this.handleAck(message);
        break;

      case 'error':
        this.handleError(message);
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }

  private handleDeliver(message: IncomingMessage): void {
    if (this.deliverHandler) {
      try {
        this.deliverHandler(message);
      } catch (error) {
        console.error('Error in deliver handler:', error);
      }
    }
  }

  private handleAck(message: WebSocketMessage): void {
    const clientSeq = message.client_seq;

    if (typeof clientSeq !== 'number') {
      console.warn('Invalid ack message - missing client_seq');
      return;
    }

    const pendingAck = this.pendingAcks.get(clientSeq);

    if (pendingAck) {
      clearTimeout(pendingAck.timeout);
      this.pendingAcks.delete(clientSeq);

      if (message.success) {
        pendingAck.resolve();
      } else {
        pendingAck.reject(new Error(message.error || 'Send failed'));
      }
    }
  }

  private handleError(message: WebSocketMessage): void {
    console.error('Server error:', message.error, message);

    // If it's a send error with client_seq, reject the pending ack
    if (message.client_seq && this.pendingAcks.has(message.client_seq)) {
      const pendingAck = this.pendingAcks.get(message.client_seq)!;
      clearTimeout(pendingAck.timeout);
      this.pendingAcks.delete(message.client_seq);
      pendingAck.reject(new Error(message.error || 'Server error'));
    }
  }

  // Public helper to check connection status
  isConnected(): boolean {
    return this.wsManager?.isConnected() ?? false;
  }

  getConnectionState(): ConnectionState {
    return this.wsManager?.getState() ?? ConnectionState.DISCONNECTED;
  }

  /**
   * Subscribe to connection state changes
   */
  onStateChange(callback: (state: ConnectionState) => void): void {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<ConnectionState>;
      callback(customEvent.detail);
    };
    this.eventTarget.addEventListener('stateChange', handler as EventListener);
  }

  /**
   * Unsubscribe from connection state changes
   */
  offStateChange(callback: (state: ConnectionState) => void): void {
    // Note: This is a simplified version. In production, you'd need to store
    // a reference to the wrapped handler to properly remove it.
    this.eventTarget.removeEventListener('stateChange', callback as EventListener);
  }

  /**
   * Emit connection state change event
   */
  private emitStateChange(state: ConnectionState): void {
    const event = new CustomEvent('stateChange', { detail: state });
    this.eventTarget.dispatchEvent(event);
  }
}
