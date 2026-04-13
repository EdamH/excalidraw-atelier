import { useCallback, useEffect, useRef, useState } from 'react';

interface NetworkStatus {
  isOnline: boolean;
  /** True after a reconnection, until the consumer resets it */
  wasOffline: boolean;
  clearWasOffline: () => void;
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const wasOfflineRef = useRef(false);
  const [wasOffline, setWasOffline] = useState(false);

  const clearWasOffline = useCallback(() => {
    wasOfflineRef.current = false;
    setWasOffline(false);
  }, []);

  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      if (wasOfflineRef.current) setWasOffline(true);
    };
    const goOffline = () => {
      setIsOnline(false);
      wasOfflineRef.current = true;
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return { isOnline, wasOffline, clearWasOffline };
}
