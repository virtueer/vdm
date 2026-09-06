import { Call } from '@wailsio/runtime';
import type { DownloadItem } from '@/types';

export const api = {
  getDownloads: async (): Promise<DownloadItem[]> => {
    try {
      const res = await Call.ByName('main.App.GetDownloads');
      return (res as DownloadItem[]) || [];
    } catch (e) {
      console.error('getDownloads error:', e);
      return [];
    }
  },

  addDownload: async (url: string, title: string): Promise<string> => {
    try {
      const res = await Call.ByName('main.App.AddDownload', url, title);
      return (res as string) || '';
    } catch (e) {
      console.error('addDownload error:', e);
      return '';
    }
  },

  pauseDownload: async (id: string): Promise<void> => {
    try {
      await Call.ByName('main.App.PauseDownload', id);
    } catch (e) {
      console.error('pauseDownload error:', e);
    }
  },

  resumeDownload: async (id: string): Promise<void> => {
    try {
      await Call.ByName('main.App.ResumeDownload', id);
    } catch (e) {
      console.error('resumeDownload error:', e);
    }
  },

  removeDownload: async (id: string, deleteFile: boolean): Promise<void> => {
    try {
      await Call.ByName('main.App.RemoveDownload', id, deleteFile);
    } catch (e) {
      console.error('removeDownload error:', e);
    }
  },

  showInFolder: async (id: string): Promise<void> => {
    try {
      await Call.ByName('main.App.ShowInFolder', id);
    } catch (e) {
      console.error('showInFolder error:', e);
    }
  },
};
