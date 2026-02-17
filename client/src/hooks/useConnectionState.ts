// React hook for monitoring WebSocket connection state
import { useState, useEffect } from 'react';
import { ConnectionState } from '../utils/WebSocketManager';
import type { DeliveryServiceSupabase } from '../services/DeliveryServiceSupabase';

export interface ConnectionStatus {
  state: ConnectionState;
  isConnected: boolean;
  isReconnecting: boolean;
  error?: Error;
}

/**
 * Hook to monitor WebSocket connection state
 * Provides real-time updates on connection status
 */
export function useConnectionState(
  deliveryService: DeliveryServiceSupabase | null
): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>({
    state: ConnectionState.DISCONNECTED,
    isConnected: false,
    isReconnecting: false,
  });

  useEffect(() => {
    if (!deliveryService) {
      setStatus({
        state: ConnectionState.DISCONNECTED,
        isConnected: false,
        isReconnecting: false,
      });
      return;
    }

    // Update status based on current state
    const updateStatus = (state: ConnectionState) => {
      setStatus({
        state,
        isConnected: state === ConnectionState.CONNECTED,
        isReconnecting: state === ConnectionState.RECONNECTING,
      });
    };

    // Initial update
    updateStatus(deliveryService.getConnectionState());

    // Listen to state change events instead of polling
    const handleStateChange = (state: ConnectionState) => {
      updateStatus(state);
    };

    deliveryService.onStateChange(handleStateChange);

    return () => {
      // Cleanup: unsubscribe from state changes
      deliveryService.offStateChange(handleStateChange);
    };
  }, [deliveryService]);

  return status;
}

/**
 * Hook to monitor offline queue size
 * Shows how many messages are waiting to be sent
 */
export function useOfflineQueueSize(): number {
  const [queueSize, setQueueSize] = useState(0);

  useEffect(() => {
    // Import dynamically to avoid circular dependencies
    import('../utils/offlineQueue').then(({ getQueue }) => {
      const updateQueueSize = async () => {
        try {
          const queue = await getQueue();
          setQueueSize(queue.length);
        } catch (error) {
          console.error('Failed to get queue size:', error);
        }
      };

      // Initial update
      updateQueueSize();

      // Update periodically
      const interval = setInterval(updateQueueSize, 2000);

      return () => {
        clearInterval(interval);
      };
    });
  }, []);

  return queueSize;
}
