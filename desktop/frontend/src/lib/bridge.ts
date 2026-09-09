/**
 * Transport layer for the local HTTP bridge (:9614) the browser extension
 * also talks to. Every request doubles as a reachability probe, so the UI can
 * report the real connection state instead of assuming it.
 */
export const BRIDGE_URL = 'http://localhost:9614';
export const BRIDGE_LABEL = '127.0.0.1:9614';

const REQUEST_TIMEOUT_MS = 4000;

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

export async function bridgeFetch(path: string, init?: RequestInit): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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

export async function bridgeJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  const resp = await bridgeFetch(path, init);
  return resp ? ((await resp.json()) as T) : null;
}

export const jsonPost = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/** Cheap HEAD probe that keeps the status bar honest. */
export async function pingBridge(): Promise<ConnectionState> {
  await bridgeFetch('/api/downloads', { method: 'HEAD' });
  return bridgeState;
}
