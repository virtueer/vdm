import { Events } from '@wailsio/runtime';
import type { DownloadItem, DownloadProgressPayload } from '@/features/downloads/types';

interface DownloadEventHandlers {
  onNew: (item: DownloadItem) => void;
  onUpdated: (item: DownloadItem) => void;
  onProgress: (payload: DownloadProgressPayload) => void;
  onRemoved: (id: string) => void;
}

/** Wails delivers payloads either as `data` or as a single-element `data` array. */
function payloadOf<T>(event: { data?: unknown }): T | null {
  const data = event?.data;
  const value = Array.isArray(data) ? data[0] : data;
  return (value as T) ?? null;
}

function on<T>(name: string, handle: (payload: T) => void): () => void {
  const off = Events.On(name, (event: { data?: unknown }) => {
    const payload = payloadOf<T>(event);
    if (payload) handle(payload);
  });
  return typeof off === 'function' ? off : () => {};
}

/** Subscribes to the backend download stream; returns a single unsubscribe. */
export function subscribeDownloadEvents(handlers: DownloadEventHandlers): () => void {
  const unsubscribers = [
    on<DownloadItem>('new_download', (item) => item.id && handlers.onNew(item)),
    on<DownloadItem>('download_updated', (item) => item.id && handlers.onUpdated(item)),
    on<DownloadProgressPayload>('download_progress', (p) => p.id && handlers.onProgress(p)),
    on<string>('download_removed', handlers.onRemoved),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}
