import { useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";
import { GetDownloads, GetConfig, GetTerminalLogs } from "../../bindings/vdm/app";
import type { AppConfig } from "../../bindings/vdm/models";
import type { DownloadItem, ProbeInfo } from "../types/download";
import { isYouTubeUrl } from "../utils/formatters";

export function useDownloadEvents(onNewYouTubeDownloadWithoutFormat?: (item: { id: string; url: string; title?: string }) => void) {
    const [downloads, setDownloads] = useState<DownloadItem[]>([]);
    const [config, setConfig] = useState<AppConfig | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [downloadLogs, setDownloadLogs] = useState<Record<string, string[]>>({});
    const [probes, setProbes] = useState<Record<string, ProbeInfo>>({});

    useEffect(() => {
        GetDownloads().then(data => Array.isArray(data) && setDownloads(data)).catch(console.error);
        GetConfig().then(cfg => setConfig(cfg)).catch(console.error);
        GetTerminalLogs().then(savedLogs => Array.isArray(savedLogs) && savedLogs.length > 0 && setLogs(savedLogs)).catch(console.error);

        const unsubs = [
            Events.On("new_download", (evt: any) => {
                const data = evt?.data ?? evt;
                if (data && data.id) {
                    setDownloads(prev => prev.find(d => String(d.id) === String(data.id)) ? prev : [data, ...prev]);
                    if (isYouTubeUrl(data.url) && !data.formatId && onNewYouTubeDownloadWithoutFormat) {
                        onNewYouTubeDownloadWithoutFormat({ id: data.id, url: data.url, title: data.title });
                    }
                }
            }),
            Events.On("download_updated", (evt: any) => {
                const data = evt?.data ?? evt;
                if (data && data.id) {
                    setDownloads(prev => prev.map(d => {
                        if (String(d.id) === String(data.id)) {
                            const isPausedOrCancelledOrCompleted = data.status === 'paused' || data.status === 'cancelled' || data.status === 'completed';
                            return {
                                ...d,
                                ...data,
                                progress: data.status === 'completed' ? 100 : (data.progress !== undefined && data.progress !== null ? data.progress : d.progress),
                                speed: isPausedOrCancelledOrCompleted ? '' : (data.speed !== undefined ? data.speed : d.speed),
                                downloadedSize: data.downloadedSize || d.downloadedSize,
                                totalSize: data.totalSize || d.totalSize,
                            };
                        }
                        return d;
                    }));
                }
            }),
            Events.On("download_progress", (evt: any) => {
                const data = evt?.data ?? evt;
                if (data && data.id) {
                    const parsedPct = parseFloat(data.percentage);
                    setDownloads(prev => prev.map(d => {
                        if (String(d.id) === String(data.id)) {
                            if (d.status === 'cancelled' || d.status === 'completed' || d.status === 'paused' || d.status === 'error') {
                                return d;
                            }
                            return {
                                ...d,
                                status: 'downloading',
                                progress: !isNaN(parsedPct) ? parsedPct : d.progress,
                                speed: data.speed !== undefined ? data.speed : d.speed,
                                downloadedSize: data.downloaded || d.downloadedSize,
                                totalSize: data.total || d.totalSize
                            };
                        }
                        return d;
                    }));
                }
            }),
            Events.On("download_removed", (evt: any) => {
                const id = evt?.data ?? evt;
                if (id) {
                    const idStr = String(id);
                    try { localStorage.removeItem(`vdm_chart_${idStr}`); } catch(e) {}
                    setDownloads(prev => prev.filter(d => String(d.id) !== idStr));
                }
            }),
            Events.On("log", (evt: any) => {
                if (evt.data) {
                    setLogs(prev => {
                        const newLogs = [...prev, evt.data];
                        return newLogs.length > 1000 ? newLogs.slice(newLogs.length - 1000) : newLogs;
                    });
                }
            }),
            Events.On("download_log", (evt: any) => {
                const data = evt?.data ?? evt;
                if (data && data.id && data.message) {
                    setDownloadLogs(prev => {
                        const existingLogs = prev[data.id] || [];
                        const newLogs = [...existingLogs, data.message];
                        return { ...prev, [data.id]: newLogs.length > 500 ? newLogs.slice(newLogs.length - 500) : newLogs };
                    });
                }
            }),
            Events.On("probe_start", (evt: any) => evt.data && setProbes(prev => ({
                ...prev,
                [evt.data.id]: { status: 'probing', speed: 0, threads: 0, startTime: Date.now() }
            }))),
            Events.On("probe_complete", (evt: any) => evt.data && setProbes(prev => ({
                ...prev,
                [evt.data.id]: { status: 'complete', speed: evt.data.speed, threads: evt.data.threads, startTime: Date.now() }
            })))
        ];

        return () => unsubs.forEach(unsub => unsub());
    }, [onNewYouTubeDownloadWithoutFormat]);

    return { downloads, setDownloads, config, setConfig, logs, setLogs, downloadLogs, setDownloadLogs, probes };
}
