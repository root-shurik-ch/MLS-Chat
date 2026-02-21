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

  if (isConnected && queueSize === 0) return null;

  const dotClass = (() => {
    switch (state) {
      case ConnectionState.CONNECTED:
        return 'bg-white/50';
      case ConnectionState.CONNECTING:
      case ConnectionState.RECONNECTING:
        return 'bg-white/25 animate-pulse';
      default:
        return 'bg-white/15';
    }
  })();

  const text = (() => {
    if (queueSize > 0) return `${queueSize} queued`;
    switch (state) {
      case ConnectionState.CONNECTING: return 'connecting';
      case ConnectionState.RECONNECTING: return 'reconnecting';
      case ConnectionState.DISCONNECTED: return 'offline';
      case ConnectionState.FAILED: return 'failed';
      default: return '';
    }
  })();

  if (!text) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-fade-in">
      <div className="flex items-center gap-2 bg-black border border-white/10 px-3 py-1.5">
        <div className={`w-1 h-1 rounded-full shrink-0 ${dotClass}`} />
        <span className="font-mono text-[10px] text-white/30 uppercase tracking-widest">
          {text}{!navigator.onLine && ' · no network'}
        </span>
      </div>
    </div>
  );
};

export default ConnectionStatus;
