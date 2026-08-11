export interface DownloadItem {
    id: string;
    url: string;
    type: string;
    size: string;
    status: string;
    progress?: number;
    speed?: string;
    downloadedSize?: string;
    totalSize?: string;
    title?: string;
    formatId?: string;
    statusMsg?: string;
    destination?: string;
}

export interface ProbeInfo {
    status: 'idle' | 'probing' | 'complete';
    speed: number;
    threads: number;
    startTime: number;
}

export type FormatSortField = 'formatId' | 'ext' | 'resolution' | 'fps' | 'filesize' | 'tbr' | 'vcodec' | 'acodec' | 'formatNote';
