import { useEffect, useSyncExternalStore } from 'react';
import { type ConnectionState, connection, pingBridge } from '@/lib/bridge';

const DEFAULT_INTERVAL_MS = 10000;

/** Live bridge reachability: subscribes to the store and keeps probing it. */
export function useBridgeConnection(intervalMs = DEFAULT_INTERVAL_MS): ConnectionState {
  const state = useSyncExternalStore(connection.subscribe, connection.getState);

  useEffect(() => {
    pingBridge();
    const id = setInterval(() => pingBridge(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return state;
}
