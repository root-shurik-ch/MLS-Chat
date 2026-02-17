import { useState, useEffect } from 'react';
import { getQueue } from '../utils/offlineQueue';

export const useOfflineQueueCount = (): number => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const updateCount = async () => {
      const queue = await getQueue();
      setCount(queue.length);
    };
    updateCount();
    // Update when queue changes, but for simplicity, update periodically or on send
    const interval = setInterval(updateCount, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, []);

  return count;
};