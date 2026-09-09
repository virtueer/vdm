import { useEffect, useSyncExternalStore } from 'react';
import { type ConnectionState, connection, pingBridge } from '@/lib/bridge';

const DEFAULT_INTERVAL_MS = 5000;

/** Live desktop-app reachability: store subscription plus a periodic probe. */
export function useBridgeConnection(intervalMs = DEFAULT_INTERVAL_MS): ConnectionState {
  const state = useSyncExternalStore(connection.subscribe, connection.getState);

  useEffect(() => {
    pingBridge();
    const id = setInterval(() => pingBridge(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return state;
}
