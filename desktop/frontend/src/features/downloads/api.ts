import { Call } from '@wailsio/runtime';
import type { DownloadItem, MediaInfo } from '@/features/downloads/types';
import { bridgeJson, jsonPost } from '@/lib/bridge';

/**
 * Domain API. Wails bindings are the primary transport; the HTTP bridge is the
 * fallback for when the binding layer is not ready yet (early startup) or the
 * page runs outside the webview.
 */
type WailsResult<T> = { ok: true; value: T } | { ok: false };

/**
 * `ok` marks a completed call — void methods resolve to `undefined`, so the
 * fallback must key on the call itself, not on the returned value.
 */
async function callWails<T>(method: string, ...args: unknown[]): Promise<WailsResult<T>> {
  try {
    return { ok: true, value: (await Call.ByName(`main.App.${method}`, ...args)) as T };
  } catch (e) {
    console.warn(`Wails ${method} failed, falling back to HTTP bridge:`, e);
    return { ok: false };
  }
}

export const api = {
  getDownloads: async (): Promise<DownloadItem[]> => {
    const res = await callWails<DownloadItem[]>('GetDownloads');
    if (res.ok && Array.isArray(res.value)) return res.value;
    return (await bridgeJson<DownloadItem[]>('/api/downloads')) ?? [];
  },

  scanDownloads: async (): Promise<DownloadItem[]> => {
    const res = await callWails<DownloadItem[]>('ScanDownloads');
    if (res.ok && Array.isArray(res.value)) return res.value;
    return (await bridgeJson<DownloadItem[]>('/api/scan', { method: 'POST' })) ?? [];
  },

  addDownload: async (url: string, title: string): Promise<string> => {
    const res = await callWails<string>('AddDownload', url, title);
    if (res.ok && res.value) return res.value;
    const data = await bridgeJson<{ id?: string }>('/api/download', jsonPost({ url, title }));
    return data?.id ?? '';
  },

  pauseDownload: async (id: string): Promise<void> => {
    if ((await callWails('PauseDownload', id)).ok) return;
    await bridgeJson('/api/pause', jsonPost({ id }));
  },

  resumeDownload: async (id: string): Promise<void> => {
    if ((await callWails('ResumeDownload', id)).ok) return;
    await bridgeJson('/api/resume', jsonPost({ id }));
  },

  removeDownload: async (id: string, deleteFile: boolean): Promise<void> => {
    if ((await callWails('RemoveDownload', id, deleteFile)).ok) return;
    await bridgeJson('/api/delete', jsonPost({ id, deleteFile }));
  },

  showInFolder: async (id: string): Promise<void> => {
    await callWails('ShowInFolder', id);
  },

  getMediaInfo: async (target: string): Promise<MediaInfo | null> => {
    const res = await callWails<MediaInfo>('GetMediaInfo', target);
    if (res.ok && res.value) return res.value;
    return bridgeJson<MediaInfo>(`/api/mediainfo?target=${encodeURIComponent(target)}`);
  },
};
