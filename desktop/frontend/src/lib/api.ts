import { Call } from '@wailsio/runtime';
import type { DownloadItem, MediaInfo } from '@/types';

export const api = {
  getDownloads: async (): Promise<DownloadItem[]> => {
    try {
      const res = await Call.ByName('main.App.GetDownloads');
      if (Array.isArray(res) && res.length > 0) {
        return res as DownloadItem[];
      }
      if (Array.isArray(res)) {
        return res as DownloadItem[];
      }
    } catch (e) {
      console.warn('Wails Call.ByName GetDownloads failed, trying HTTP fallback:', e);
    }

    try {
      const resp = await fetch('http://localhost:9614/api/downloads');
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data)) {
          return data as DownloadItem[];
        }
      }
    } catch (e) {
      console.error('HTTP getDownloads fallback error:', e);
    }
    return [];
  },

  scanDownloads: async (): Promise<DownloadItem[]> => {
    try {
      const res = await Call.ByName('main.App.ScanDownloads');
      if (Array.isArray(res) && res.length > 0) {
        return res as DownloadItem[];
      }
      if (Array.isArray(res)) {
        return res as DownloadItem[];
      }
    } catch (e) {
      console.warn('Wails ScanDownloads failed, trying HTTP fallback:', e);
    }

    try {
      const resp = await fetch('http://localhost:9614/api/scan', { method: 'POST' });
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data)) {
          return data as DownloadItem[];
        }
      }
    } catch (e) {
      console.error('HTTP scan fallback error:', e);
    }
    return [];
  },

  addDownload: async (url: string, title: string): Promise<string> => {
    try {
      const res = await Call.ByName('main.App.AddDownload', url, title);
      if (res) return res as string;
    } catch (e) {
      console.warn('Wails AddDownload failed, trying HTTP fallback:', e);
    }

    try {
      const resp = await fetch('http://localhost:9614/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, title }),
      });
      if (resp.ok) {
        const data = await resp.json();
        return data.id || '';
      }
    } catch (e) {
      console.error('HTTP addDownload fallback error:', e);
    }
    return '';
  },

  pauseDownload: async (id: string): Promise<void> => {
    try {
      await Call.ByName('main.App.PauseDownload', id);
      return;
    } catch (e) {
      console.warn('Wails PauseDownload failed, trying HTTP fallback:', e);
    }

    try {
      await fetch('http://localhost:9614/api/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
    } catch (e) {
      console.error('HTTP pause fallback error:', e);
    }
  },

  resumeDownload: async (id: string): Promise<void> => {
    try {
      await Call.ByName('main.App.ResumeDownload', id);
      return;
    } catch (e) {
      console.warn('Wails ResumeDownload failed, trying HTTP fallback:', e);
    }

    try {
      await fetch('http://localhost:9614/api/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
    } catch (e) {
      console.error('HTTP resume fallback error:', e);
    }
  },

  removeDownload: async (id: string, deleteFile: boolean): Promise<void> => {
    try {
      await Call.ByName('main.App.RemoveDownload', id, deleteFile);
      return;
    } catch (e) {
      console.warn('Wails RemoveDownload failed, trying HTTP fallback:', e);
    }

    try {
      await fetch('http://localhost:9614/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, deleteFile }),
      });
    } catch (e) {
      console.error('HTTP delete fallback error:', e);
    }
  },

  showInFolder: async (id: string): Promise<void> => {
    try {
      await Call.ByName('main.App.ShowInFolder', id);
    } catch (e) {
      console.error('showInFolder error:', e);
    }
  },

  getMediaInfo: async (target: string): Promise<MediaInfo | null> => {
    try {
      const res = await Call.ByName('main.App.GetMediaInfo', target);
      if (res) return res as MediaInfo;
    } catch (e) {
      console.warn('Wails GetMediaInfo failed, trying HTTP fallback:', e);
    }

    try {
      const resp = await fetch(
        `http://localhost:9614/api/mediainfo?target=${encodeURIComponent(target)}`
      );
      if (resp.ok) {
        const data = await resp.json();
        return data as MediaInfo;
      }
    } catch (e) {
      console.error('HTTP getMediaInfo fallback error:', e);
    }
    return null;
  },
};
