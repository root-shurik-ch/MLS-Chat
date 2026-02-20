// Connection status indicator — subtle monochrome status line
import React from 'react';
import { ConnectionState } from '../utils/WebSocketManager';
import { useConnectionState, useOfflineQueueSize } from '../hooks/useConnectionState';
import type { DeliveryServiceSupabase } from '../services/DeliveryServiceSupabase';

interface ConnectionStatusProps {
  deliveryService: DeliveryServiceSupabase | null;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ deliveryService }) => {
  const { state, isConnected } = useConnectionState(deliveryService);
  const queueSize = useOfflineQueueSize();

  // Don't show anything if connected and queue is empty
  if (isConnected && queueSize === 0) {
    return null;
  }

  const getDotClass = () => {
    switch (state) {
      case ConnectionState.CONNECTED:
        return 'bg-white/60';
      case ConnectionState.CONNECTING:
      case ConnectionState.RECONNECTING:
        return 'bg-white/30 animate-pulse';
      case ConnectionState.DISCONNECTED:
      case ConnectionState.FAILED:
        return 'bg-white/20';
      default:
        return 'bg-white/10';
    }
  };

  const getStatusText = () => {
    if (queueSize > 0) return `${queueSize} queued`;
    switch (state) {
      case ConnectionState.CONNECTING: return 'connecting';
      case ConnectionState.RECONNECTING: return 'reconnecting';
      case ConnectionState.DISCONNECTED: return 'disconnected';
      case ConnectionState.FAILED: return 'connection failed';
      default: return '';
    }
  };

  const text = getStatusText();
  if (!text) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="flex items-center gap-2 bg-black border border-white/10 px-3 py-1.5">
        <div className={`w-1.5 h-1.5 rounded-full ${getDotClass()}`} />
        <span className="font-mono text-[11px] text-white/30 uppercase tracking-widest">
          {text}{!navigator.onLine && ' · offline'}
        </span>
      </div>
    </div>
  );
};

export default ConnectionStatus;
