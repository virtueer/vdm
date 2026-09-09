import { useCallback, useEffect, useState } from 'react';
import { api } from '@/features/downloads/api';
import { subscribeDownloadEvents } from '@/features/downloads/events';
import type { DownloadItem } from '@/features/downloads/types';

/** The Wails binding layer needs a moment after mount; retry the first load. */
const STARTUP_RETRIES_MS = [250, 800, 2000];
const SCAN_SPINNER_MS = 400;

export interface DownloadsState {
  downloads: DownloadItem[];
  isRefreshing: boolean;
  refresh: (isManualScan?: boolean) => Promise<void>;
  removeLocal: (id: string) => void;
}

/** Owns the download list: initial load, backend event stream and refreshes. */
export function useDownloads(): DownloadsState {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = useCallback(async (isManualScan = false) => {
    if (isManualScan) setIsRefreshing(true);
    try {
      const data = isManualScan ? await api.scanDownloads() : await api.getDownloads();
      if (Array.isArray(data)) setDownloads(data);
    } catch (e) {
      console.error('refresh error:', e);
    } finally {
      if (isManualScan) setTimeout(() => setIsRefreshing(false), SCAN_SPINNER_MS);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timers = STARTUP_RETRIES_MS.map((ms) => setTimeout(() => refresh(), ms));

    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);

    const unsubscribe = subscribeDownloadEvents({
      onNew: (item) => setDownloads((prev) => [item, ...prev.filter((d) => d.id !== item.id)]),
      onUpdated: (item) =>
        setDownloads((prev) => prev.map((d) => (d.id === item.id ? { ...d, ...item } : d))),
      onProgress: (p) =>
        setDownloads((prev) =>
          prev.map((d) =>
            d.id === p.id
              ? {
                  ...d,
                  progress: Number.parseFloat(p.percentage) || 0,
                  speed: p.speed,
                  downloadedSize: p.downloaded,
                  totalSize: p.total || d.totalSize,
                  statusMsg: p.statusMsg || d.statusMsg,
                }
              : d
          )
        ),
      onRemoved: (id) => setDownloads((prev) => prev.filter((d) => d.id !== id)),
    });

    return () => {
      for (const timer of timers) clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
      unsubscribe();
    };
  }, [refresh]);

  const removeLocal = useCallback((id: string) => {
    setDownloads((prev) => prev.filter((d) => d.id !== id));
  }, []);

  return { downloads, isRefreshing, refresh, removeLocal };
}
