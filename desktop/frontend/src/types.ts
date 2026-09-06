export interface DownloadItem {
  id: string;
  url: string;
  title: string;
  destination: string;
  status: 'pending' | 'downloading' | 'paused' | 'completed' | 'error' | 'cancelled';
  statusMsg: string;
  progress: number;
  speed: string;
  downloadedSize: string;
  totalSize: string;
  elapsedSecs: number;
  startedAt: number;
  createdAt: number;
}

export interface DownloadProgressPayload {
  id: string;
  percentage: string;
  downloaded: string;
  total: string;
  speed: string;
}
