// WebSocket Manager with auto-reconnect, heartbeat, and connection state management
// Provides reliable real-time communication with automatic recovery

export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  RECONNECTING = 'RECONNECTING',
  FAILED = 'FAILED'
}

export interface WebSocketConfig {
  url: string;
  heartbeatInterval?: number; // ms, default 30000 (30s)
  reconnectDelay?: number; // ms, default 1000 (1s)
  maxReconnectDelay?: number; // ms, default 30000 (30s)
  maxReconnectAttempts?: number; // default Infinity
  connectionTimeout?: number; // ms, default 10000 (10s)
}

export interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

type MessageHandler = (message: WebSocketMessage) => void;
type StateChangeHandler = (state: ConnectionState, error?: Error) => void;

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private config: Required<WebSocketConfig>;
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private connectionTimeoutTimer: number | null = null;
  private lastPongTime = 0;
  private pendingMessages: WebSocketMessage[] = [];

  private messageHandlers = new Set<MessageHandler>();
  private stateChangeHandlers = new Set<StateChangeHandler>();

  constructor(config: WebSocketConfig) {
    this.config = {
      url: config.url,
      heartbeatInterval: config.heartbeatInterval ?? 30000,
      reconnectDelay: config.reconnectDelay ?? 1000,
      maxReconnectDelay: config.maxReconnectDelay ?? 30000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? Infinity,
      connectionTimeout: config.connectionTimeout ?? 10000
    };
  }

  /**
   * Connect to WebSocket server
   */
  connect(): Promise<void> {
    if (this.state === ConnectionState.CONNECTED || this.state === ConnectionState.CONNECTING) {
      return Promise.resolve();
    }

    this.setState(ConnectionState.CONNECTING);
    this.clearTimers();

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.url);
        if (typeof window !== 'undefined') {
          (window as unknown as { __ds_ws?: WebSocket }).__ds_ws = this.ws;
        }

        // Connection timeout
        this.connectionTimeoutTimer = window.setTimeout(() => {
          if (this.state === ConnectionState.CONNECTING) {
            this.ws?.close();
            reject(new Error('Connection timeout'));
            this.scheduleReconnect();
          }
        }, this.config.connectionTimeout);

        this.ws.onopen = () => {
          this.clearTimers();
          this.reconnectAttempts = 0;
          this.setState(ConnectionState.CONNECTED);
          this.startHeartbeat();
          this.sendPendingMessages();
          resolve();
        };

        this.ws.onclose = (event) => {
          this.clearTimers();
          if (typeof window !== 'undefined') {
            (window as unknown as { __ds_last_close?: { code: number; reason: string; wasClean: boolean } }).__ds_last_close = {
              code: event.code,
              reason: event.reason,
              wasClean: event.wasClean
            };
          }
          console.log('WebSocket closed', event.code, event.reason);

          if (this.state !== ConnectionState.DISCONNECTED) {
            this.setState(ConnectionState.DISCONNECTED);
            this.scheduleReconnect();
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error', error);
          const errorObj = new Error('WebSocket connection error');
          this.setState(ConnectionState.FAILED, errorObj);
          reject(errorObj);
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as WebSocketMessage;

            // Handle pong response
            if (message.type === 'pong') {
              this.lastPongTime = Date.now();
              return;
            }

            // Notify all message handlers
            this.messageHandlers.forEach(handler => {
              try {
                handler(message);
              } catch (e) {
                console.error('Message handler error:', e);
              }
            });
          } catch (e) {
            console.error('Failed to parse WebSocket message:', e);
          }
        };
      } catch (error) {
        this.setState(ConnectionState.FAILED, error as Error);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.setState(ConnectionState.DISCONNECTED);
    this.clearTimers();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
  }

  /**
   * Send message to server
   * If not connected, message will be queued and sent when connection is restored
   */
  send(message: WebSocketMessage): void {
    if (this.isConnected() && this.ws) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('Failed to send message:', error);
        this.pendingMessages.push(message);
      }
    } else {
      // Queue message for later
      this.pendingMessages.push(message);
      console.log('Message queued (not connected):', message.type);
    }
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED &&
           this.ws !== null &&
           this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Register message handler
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    // Return unsubscribe function
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * Register state change handler
   */
  onStateChange(handler: StateChangeHandler): () => void {
    this.stateChangeHandlers.add(handler);
    // Return unsubscribe function
    return () => this.stateChangeHandlers.delete(handler);
  }

  /**
   * Update WebSocket URL (requires reconnect)
   */
  updateUrl(url: string): void {
    this.config.url = url;
    if (this.isConnected()) {
      this.disconnect();
      this.connect();
    }
  }

  // Private methods

  private setState(newState: ConnectionState, error?: Error): void {
    if (this.state === newState) return;

    const oldState = this.state;
    this.state = newState;

    console.log(`WebSocket state: ${oldState} -> ${newState}`);

    this.stateChangeHandlers.forEach(handler => {
      try {
        handler(newState, error);
      } catch (e) {
        console.error('State change handler error:', e);
      }
    });
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();

    this.heartbeatTimer = window.setInterval(() => {
      if (this.isConnected()) {
        // Check if last pong was received
        if (this.lastPongTime > 0) {
          const timeSinceLastPong = Date.now() - this.lastPongTime;
          if (timeSinceLastPong > this.config.heartbeatInterval * 2) {
            console.warn('Heartbeat timeout - no pong received');
            this.ws?.close();
            return;
          }
        }

        // Send ping
        this.send({ type: 'ping', timestamp: Date.now() });
      }
    }, this.config.heartbeatInterval);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearHeartbeat();

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.connectionTimeoutTimer !== null) {
      clearTimeout(this.connectionTimeoutTimer);
      this.connectionTimeoutTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached');
      this.setState(ConnectionState.FAILED, new Error('Max reconnect attempts reached'));
      return;
    }

    this.setState(ConnectionState.RECONNECTING);

    // Exponential backoff with jitter
    const delay = Math.min(
      this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.config.maxReconnectDelay
    );
    const jitter = Math.random() * 1000; // Add up to 1s jitter
    const totalDelay = delay + jitter;

    console.log(`Reconnecting in ${Math.round(totalDelay)}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectAttempts++;
      this.connect().catch(error => {
        console.error('Reconnect failed:', error);
      });
    }, totalDelay);
  }

  private sendPendingMessages(): void {
    if (this.pendingMessages.length === 0) return;

    console.log(`Sending ${this.pendingMessages.length} pending messages`);

    const messages = [...this.pendingMessages];
    this.pendingMessages = [];

    messages.forEach(message => {
      this.send(message);
    });
  }
}
