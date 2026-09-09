/** Desktop app bridge: the local HTTP listener the VDM app exposes. */
export const BRIDGE_URL = 'http://localhost:9614';
export const BRIDGE_LABEL = '127.0.0.1:9614';

export type ConnectionState = 'unknown' | 'connected' | 'disconnected';

let bridgeState: ConnectionState = 'unknown';
const listeners = new Set<() => void>();

function setBridgeState(next: ConnectionState) {
  if (next === bridgeState) return;
  bridgeState = next;
  for (const listener of listeners) listener();
}

/** Reachability store, shaped for useSyncExternalStore. */
export const connection = {
  getState: (): ConnectionState => bridgeState,
  subscribe: (onChange: () => void) => {
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  },
};

/** Every bridge request doubles as a reachability probe. */
async function bridgeFetch(path: string, init?: RequestInit): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const resp = await fetch(`${BRIDGE_URL}${path}`, { ...init, signal: controller.signal });
    setBridgeState(resp.ok ? 'connected' : 'disconnected');
    return resp.ok ? resp : null;
  } catch (e) {
    setBridgeState('disconnected');
    console.warn(`bridge ${path} unreachable:`, e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Cheap HEAD probe used by the popup status bar. */
export async function pingBridge(): Promise<ConnectionState> {
  await bridgeFetch('/api/downloads', { method: 'HEAD' });
  return bridgeState;
}

export interface BridgeDownload {
  url: string;
  type: string;
  size: string;
  pageUrl: string;
  title: string;
}

export async function sendToBridge(payload: BridgeDownload): Promise<boolean> {
  const resp = await bridgeFetch('/api/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return resp !== null;
}
