// Connection status indicator component
import React from 'react';
import { ConnectionState } from '../utils/WebSocketManager';
import { useConnectionState, useOfflineQueueSize } from '../hooks/useConnectionState';
import type { DeliveryServiceSupabase } from '../services/DeliveryServiceSupabase';

interface ConnectionStatusProps {
  deliveryService: DeliveryServiceSupabase | null;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ deliveryService }) => {
  const { state, isConnected, isReconnecting } = useConnectionState(deliveryService);
  const queueSize = useOfflineQueueSize();

  // Don't show anything if connected and queue is empty
  if (isConnected && queueSize === 0) {
    return null;
  }

  const getStatusColor = () => {
    switch (state) {
      case ConnectionState.CONNECTED:
        return 'bg-green-500';
      case ConnectionState.CONNECTING:
      case ConnectionState.RECONNECTING:
        return 'bg-yellow-500';
      case ConnectionState.DISCONNECTED:
      case ConnectionState.FAILED:
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusText = () => {
    if (queueSize > 0) {
      return `${queueSize} message${queueSize > 1 ? 's' : ''} queued`;
    }

    switch (state) {
      case ConnectionState.CONNECTED:
        return 'Connected';
      case ConnectionState.CONNECTING:
        return 'Connecting...';
      case ConnectionState.RECONNECTING:
        return 'Reconnecting...';
      case ConnectionState.DISCONNECTED:
        return 'Disconnected';
      case ConnectionState.FAILED:
        return 'Connection failed';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="fixed top-4 right-4 z-50">
      <div className="flex items-center gap-2 bg-white dark:bg-gray-800 shadow-lg rounded-lg px-4 py-2 border border-gray-200 dark:border-gray-700">
        {/* Status indicator dot */}
        <div className="relative flex items-center">
          <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
          {isReconnecting && (
            <div className={`absolute w-2 h-2 rounded-full ${getStatusColor()} animate-ping`} />
          )}
        </div>

        {/* Status text */}
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {getStatusText()}
        </span>

        {/* Offline indicator */}
        {!navigator.onLine && (
          <span className="text-xs text-orange-600 dark:text-orange-400 font-semibold">
            OFFLINE
          </span>
        )}
      </div>
    </div>
  );
};

export default ConnectionStatus;
