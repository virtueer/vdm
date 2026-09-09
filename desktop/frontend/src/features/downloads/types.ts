export interface DownloadItem {
  id: string;
  url: string;
  title: string;
  destination: string;
  status: 'pending' | 'queued' | 'downloading' | 'paused' | 'completed' | 'error' | 'cancelled';
  statusMsg: string;
  errorDetails?: string;
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
  statusMsg?: string;
}

export interface StreamInfo {
  index: number;
  codecType: 'video' | 'audio' | 'subtitle' | string;
  codecName: string;
  codecLong?: string;
  resolution?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  fps?: string;
  bitrate?: string;
  channels?: number;
  channelLayout?: string;
  sampleRate?: string;
  language?: string;
  title?: string;
}

export interface MediaInfo {
  filePath: string;
  fileName: string;
  fileSize: string;
  sizeBytes: number;
  duration: string;
  durationSecs: number;
  formatName: string;
  overallBitrate: string;
  videoStreams: StreamInfo[];
  audioStreams: StreamInfo[];
  subtitleStreams: StreamInfo[];
}
