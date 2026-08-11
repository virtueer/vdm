import React, { useEffect, useState, useRef } from "react";
import { Events } from "@wailsio/runtime";
import { GetDownloads, GetConfig, SaveConfig, CancelDownload, PauseDownload, ResumeDownload, RemoveDownload, RetryDownload, ShowInFolder, GetYouTubeFormats, SetDownloadFormat, GetTerminalLogs, GetDownloadLogs } from "../bindings/vdm/app";
import type { AppConfig, YouTubeFormat } from "../bindings/vdm/models";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Inbox, FileVideo, Activity, Settings, Terminal, DownloadCloud, XCircle, Pause, Play, Trash2, ChevronDown, ChevronUp, RefreshCw, FolderOpen, Zap, Search, Loader2, Check, ListFilter, SlidersHorizontal, Copy } from "lucide-react";
import { SpeedChart } from "./components/SpeedChart";

interface DownloadItem {
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
}

interface ProbeInfo {
    status: 'idle' | 'probing' | 'complete';
    speed: number;
    threads: number;
    startTime: number;
}

function formatSpeed(bytesPerSec: number): string {
    if (bytesPerSec < 1024) return `${bytesPerSec} B/s`;
    if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    if (bytesPerSec < 1024 * 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
    return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
}

function formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getFilenameFromUrl(url: string): string {
    try {
        const path = new URL(url).pathname;
        const parts = path.split('/');
        const lastPart = parts[parts.length - 1];
        if (lastPart) {
            return lastPart.length > 40 ? lastPart.substring(0, 40) + '...' : lastPart;
        }
    } catch(e) {}
    return "Video.mp4";
}

function isYouTubeUrl(url: string): boolean {
    return url.includes("youtube.com") || url.includes("youtu.be");
}

function TerminalLine({ line }: { line: string }) {
    const tsMatch = line.match(/^(\[\d{2}:\d{2}:\d{2}\])\s*(.*)$/);
    let timeStr = "";
    let content = line;
    if (tsMatch) {
        timeStr = tsMatch[1];
        content = tsMatch[2];
    }

    let colorClass = "text-zinc-300";

    if (content.startsWith("Executing command:") || content.startsWith("New download request:")) {
        colorClass = "text-amber-400 font-medium";
    } else if (content.includes("Download completed") || content.includes("Command started successfully")) {
        colorClass = "text-emerald-400 font-medium";
    } else if (content.toLowerCase().includes("error") || content.toLowerCase().includes("failed") || content.includes("Deleting partial") || content.includes("Deleting file")) {
        colorClass = "text-rose-400";
    } else if (content.startsWith("[youtube]") || content.startsWith("[info]")) {
        colorClass = "text-sky-400";
    } else if (content.startsWith("[download]")) {
        colorClass = "text-teal-300";
    } else if (content.startsWith("[#")) {
        colorClass = "text-emerald-400 font-mono";
    }

    return (
        <div className="flex items-start gap-2 text-[11px] font-mono py-0.5 border-b border-zinc-800/40 hover:bg-zinc-800/30 px-1.5 rounded transition-colors group">
            {timeStr && (
                <span className="text-zinc-500 group-hover:text-zinc-400 font-medium select-none shrink-0 text-[10px] pt-0.5">
                    {timeStr}
                </span>
            )}
            <span className={`break-all leading-relaxed ${colorClass}`}>
                {content}
            </span>
        </div>
    );
}

export default function App() {
    const [downloads, setDownloads] = useState<DownloadItem[]>([]);
    const [config, setConfig] = useState<AppConfig | null>(null);
    const [activeTab, setActiveTab] = useState<"downloads" | "settings">("downloads");
    const [showTerminal, setShowTerminal] = useState(false);
    const [terminalHeight, setTerminalHeight] = useState<number>(280);
    const [logs, setLogs] = useState<string[]>([]);
    const [downloadLogs, setDownloadLogs] = useState<Record<string, string[]>>({});
    const [probes, setProbes] = useState<Record<string, ProbeInfo>>({});
    
    const [showManualInput, setShowManualInput] = useState(false);
    const [manualUrl, setManualUrl] = useState('');
    const [manualTitle, setManualTitle] = useState('');
    
    const [itemToDelete, setItemToDelete] = useState<string | null>(null);
    const [deleteFileFromDisk, setDeleteFileFromDisk] = useState<boolean>(true);
    const [logModalItem, setLogModalItem] = useState<string | null>(null);

    useEffect(() => {
        if (logModalItem) {
            GetDownloadLogs(logModalItem).then((savedLogs) => {
                if (Array.isArray(savedLogs) && savedLogs.length > 0) {
                    setDownloadLogs(prev => ({
                        ...prev,
                        [logModalItem]: savedLogs
                    }));
                }
            }).catch(console.error);
        }
    }, [logModalItem]);

    const [formatModalTarget, setFormatModalTarget] = useState<{ id?: string; url: string; title?: string } | null>(null);
    const [formatLoading, setFormatLoading] = useState(false);
    const [formatError, setFormatError] = useState<string | null>(null);
    const [formatsList, setFormatsList] = useState<YouTubeFormat[]>([]);
    const [selectedFormatId, setSelectedFormatId] = useState<string | null>(null);
    const [autoAppendAudio, setAutoAppendAudio] = useState(true);
    const [formatCategory, setFormatCategory] = useState<'all' | 'combined' | 'video' | 'audio'>('all');

    type FormatSortField = 'formatId' | 'ext' | 'resolution' | 'fps' | 'filesize' | 'tbr' | 'vcodec' | 'acodec' | 'formatNote';
    const [formatSortField, setFormatSortField] = useState<FormatSortField | null>(null);
    const [formatSortAsc, setFormatSortAsc] = useState<boolean>(true);

    const [copiedTerminalLogs, setCopiedTerminalLogs] = useState(false);
    const [copiedProcessLogs, setCopiedProcessLogs] = useState(false);

    const terminalEndRef = useRef<HTMLDivElement>(null);

    const activeCount = downloads.filter(d => d.status === 'downloading').length;
    const queuedCount = downloads.filter(d => d.status === 'pending').length;
    const completedCount = downloads.filter(d => d.status === 'completed').length;
    const erroredCount = downloads.filter(d => d.status === 'error' || d.status === 'cancelled').length;

    useEffect(() => {
        GetDownloads().then((data) => {
            if (Array.isArray(data)) setDownloads(data);
        }).catch(console.error);

        GetConfig().then((cfg) => {
            setConfig(cfg);
        }).catch(console.error);

        GetTerminalLogs().then((savedLogs) => {
            if (Array.isArray(savedLogs) && savedLogs.length > 0) {
                setLogs(savedLogs);
            }
        }).catch(console.error);

        // Listen for events
        const unsubs = [
            Events.On("new_download", (evt: any) => {
                const data = evt?.data ?? evt;
                if (data && data.id) {
                    setDownloads(prev => {
                        if (prev.find(d => d.id === data.id)) return prev;
                        return [data, ...prev];
                    });

                    if (isYouTubeUrl(data.url) && !data.formatId) {
                        openFormatModal({ id: data.id, url: data.url, title: data.title });
                    }
                }
            }),
            Events.On("download_updated", (evt: any) => {
                const data = evt?.data ?? evt;
                if (data && data.id) {
                    setDownloads(prev => prev.map(d => {
                        if (d.id === data.id) {
                            const isPausedOrCancelled = data.status === 'paused' || data.status === 'cancelled';
                            return {
                                ...d,
                                ...data,
                                progress: data.progress !== undefined && data.progress !== null ? data.progress : d.progress,
                                speed: isPausedOrCancelled ? '' : (data.speed !== undefined ? data.speed : d.speed),
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
                        if (d.id === data.id) {
                            if (d.status === 'paused' || d.status === 'cancelled' || d.status === 'completed') {
                                return d;
                            }
                            return {
                                ...d,
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
                if (evt.data) {
                    setDownloads(prev => prev.filter(d => d.id !== evt.data));
                }
            }),
            Events.On("log", (evt: any) => {
                if (evt.data) {
                    setLogs(prev => {
                        const newLogs = [...prev, evt.data];
                        if (newLogs.length > 1000) return newLogs.slice(newLogs.length - 1000);
                        return newLogs;
                    });
                }
            }),
            Events.On("download_log", (evt: any) => {
                const data = evt?.data ?? evt;
                if (data && data.id && data.message) {
                    setDownloadLogs(prev => {
                        const existingLogs = prev[data.id] || [];
                        const newLogs = [...existingLogs, data.message];
                        if (newLogs.length > 500) return { ...prev, [data.id]: newLogs.slice(newLogs.length - 500) };
                        return { ...prev, [data.id]: newLogs };
                    });
                }
            }),
            Events.On("probe_start", (evt: any) => {
                if (evt.data) {
                    setProbes(prev => ({
                        ...prev,
                        [evt.data.id]: {
                            status: 'probing',
                            speed: 0,
                            threads: 0,
                            startTime: Date.now()
                        }
                    }));
                }
            }),
            Events.On("probe_complete", (evt: any) => {
                if (evt.data) {
                    setProbes(prev => ({
                        ...prev,
                        [evt.data.id]: {
                            status: 'complete',
                            speed: evt.data.speed,
                            threads: evt.data.threads,
                            startTime: Date.now()
                        }
                    }));
                }
            })
        ];

        return () => unsubs.forEach(unsub => unsub());
    }, []);

    useEffect(() => {
        // Only scroll to bottom when opening terminal initially
        if (showTerminal && terminalEndRef.current && logs.length > 0 && logs.length <= 5) {
            terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [showTerminal]);

    const handleConfigChange = (newConfig: AppConfig) => {
        setConfig(newConfig);
        SaveConfig(newConfig).catch(console.error);
    };

    const handleManualDownload = (chosenFormatId?: string) => {
        if (!manualUrl.trim()) return;
        
        fetch('http://localhost:9614/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: manualUrl.trim(),
                type: isYouTubeUrl(manualUrl) ? 'youtube' : 'manual',
                size: 'Unknown',
                pageUrl: '',
                title: manualTitle.trim() || '',
                formatId: chosenFormatId || ''
            })
        }).then(res => {
            if (res.ok) {
                setManualUrl('');
                setManualTitle('');
                setShowManualInput(false);
                setFormatModalTarget(null);
            } else {
                alert('Failed to add download. Make sure the desktop app is running.');
            }
        }).catch(err => {
            console.error('Failed to add download:', err);
            alert('Failed to add download.');
        });
    };

    const handlePasteUrl = async () => {
        try {
            const text = await navigator.clipboard.readText();
            setManualUrl(text);
        } catch (err) {
            console.error('Failed to read clipboard:', err);
        }
    };

    const openFormatModal = (target: { id?: string; url: string; title?: string }) => {
        setFormatModalTarget(target);
        setFormatLoading(true);
        setFormatError(null);
        setFormatsList([]);
        setSelectedFormatId(null);

        GetYouTubeFormats(target.url)
            .then(res => {
                if (Array.isArray(res)) {
                    setFormatsList(res);
                } else {
                    setFormatError("No formats found.");
                }
            })
            .catch(err => {
                console.error("Format fetch error:", err);
                setFormatError("yt-dlp format fetch failed: " + (err?.message || err));
            })
            .finally(() => {
                setFormatLoading(false);
            });
    };

    const applySelectedFormat = () => {
        if (!formatModalTarget || !selectedFormatId) return;

        let finalFormat = selectedFormatId;
        const targetFormat = formatsList.find(f => f.formatId === selectedFormatId);
        
        // If it's a video-only format and autoAppendAudio is enabled, append +bestaudio
        if (targetFormat && targetFormat.vcodec !== 'none' && targetFormat.acodec === 'none' && autoAppendAudio) {
            finalFormat = `${selectedFormatId}+bestaudio`;
        }

        if (formatModalTarget.id) {
            // Existing item in list
            SetDownloadFormat(formatModalTarget.id, finalFormat).then(() => {
                // If it's currently paused/errored, resume it
                const existing = downloads.find(d => d.id === formatModalTarget.id);
                if (existing && (existing.status === 'paused' || existing.status === 'error' || existing.status === 'cancelled')) {
                    ResumeDownload(formatModalTarget.id).catch(console.error);
                }
            }).catch(console.error);
        } else {
            // New manual download input
            handleManualDownload(finalFormat);
        }

        setFormatModalTarget(null);
    };

    const handleFormatSort = (field: FormatSortField) => {
        if (formatSortField === field) {
            setFormatSortAsc(!formatSortAsc);
        } else {
            setFormatSortField(field);
            setFormatSortAsc(true);
        }
    };

    const renderFormatSortHeader = (label: string, field: FormatSortField) => {
        const isActive = formatSortField === field;
        return (
            <th 
                onClick={() => handleFormatSort(field)}
                className="p-2.5 cursor-pointer hover:bg-muted/70 transition-colors select-none group"
            >
                <div className="flex items-center gap-1">
                    <span>{label}</span>
                    <span className="text-[10px] text-muted-foreground group-hover:text-foreground">
                        {isActive ? (formatSortAsc ? '▲' : '▼') : '↕'}
                    </span>
                </div>
            </th>
        );
    };

    const filteredFormats = formatsList.filter(f => {
        const isVideo = f.vcodec !== 'none' && f.vcodec !== '';
        const isAudio = f.acodec !== 'none' && f.acodec !== '';
        if (formatCategory === 'combined') return isVideo && isAudio;
        if (formatCategory === 'video') return isVideo && !isAudio;
        if (formatCategory === 'audio') return isAudio && !isVideo;
        return true;
    });

    const sortedFormats = [...filteredFormats].sort((a, b) => {
        if (!formatSortField) return 0;

        let valA: any = a[formatSortField];
        let valB: any = b[formatSortField];

        if (formatSortField === 'resolution') {
            const parseRes = (r: string) => {
                if (!r) return 0;
                const match = r.match(/(\d+)x(\d+)/);
                if (match) return parseInt(match[2]);
                const matchP = r.match(/(\d+)p/);
                if (matchP) return parseInt(matchP[1]);
                const single = r.match(/(\d+)/);
                return single ? parseInt(single[1]) : 0;
            };
            valA = parseRes(a.resolution);
            valB = parseRes(b.resolution);
        } else if (formatSortField === 'formatId') {
            const intA = parseInt(a.formatId);
            const intB = parseInt(b.formatId);
            if (!isNaN(intA) && !isNaN(intB)) {
                valA = intA;
                valB = intB;
            }
        }

        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;

        if (typeof valA === 'number' && typeof valB === 'number') {
            return formatSortAsc ? valA - valB : valB - valA;
        }

        const strA = String(valA).toLowerCase();
        const strB = String(valB).toLowerCase();
        return formatSortAsc ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });

    return (
        <div className="flex flex-col h-full bg-background text-foreground transition-colors">
            <header className="flex items-center justify-between px-6 py-3 border-b bg-card shrink-0">
                <div className="flex items-center gap-3">
                    <div className="bg-primary p-1.5 rounded-lg text-primary-foreground">
                        <Activity className="w-4 h-4" />
                    </div>
                    <div>
                        <h1 className="text-base font-semibold leading-none">Video Download Manager</h1>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 bg-muted/50 p-0.5 rounded-md">
                        <button 
                            onClick={() => setActiveTab("downloads")}
                            className={`px-3 py-1.5 text-sm font-medium rounded transition-all flex items-center gap-2 ${activeTab === 'downloads' ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            <DownloadCloud className="w-3.5 h-3.5" />
                            Downloads
                        </button>
                        <button 
                            onClick={() => setActiveTab("settings")}
                            className={`px-3 py-1.5 text-sm font-medium rounded transition-all flex items-center gap-2 ${activeTab === 'settings' ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            <Settings className="w-3.5 h-3.5" />
                            Settings
                        </button>
                    </div>

                    <button 
                        onClick={() => setShowTerminal(!showTerminal)}
                        className={`p-2 rounded-md transition-colors ${showTerminal ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                        title="Toggle Terminal Logs"
                    >
                        <Terminal className="w-4 h-4" />
                    </button>

                    <div className="flex items-center gap-2 ml-2">
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                        </span>
                        <span className="text-xs font-medium text-muted-foreground hidden sm:inline-block">Connected</span>
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-hidden flex flex-col relative">
                {/* Main Content Area */}
                <div 
                    style={showTerminal ? { height: `calc(100% - ${terminalHeight}px)` } : { height: '100%' }}
                    className="w-full px-6 py-4 flex flex-col transition-all duration-150 overflow-hidden"
                >
                    <div className={`flex-1 flex flex-col min-h-0 ${activeTab === "downloads" ? "" : "hidden"}`}>
                        <div className="mb-3 shrink-0 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-semibold">Downloads</h2>
                                <p className="text-sm text-muted-foreground">Monitor and manage your media downloads.</p>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-muted-foreground">Active:</span>
                                    <span className="font-medium text-primary">{activeCount}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-muted-foreground">Queued:</span>
                                    <span className="font-medium text-foreground">{queuedCount}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-muted-foreground">Completed:</span>
                                    <span className="font-medium text-foreground">{completedCount}</span>
                                </div>
                                {erroredCount > 0 && (
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-muted-foreground">Errors:</span>
                                        <span className="font-medium text-destructive">{erroredCount}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Manual Download Input */}
                        <Card className="mb-3">
                            <CardContent className="p-3">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setShowManualInput(!showManualInput)}
                                        className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2 shrink-0"
                                    >
                                        <DownloadCloud className="w-4 h-4" />
                                        Add URL
                                    </button>
                                    {showManualInput && (
                                        <>
                                            <input
                                                type="text"
                                                placeholder="Paste video URL here..."
                                                value={manualUrl}
                                                onChange={(e) => setManualUrl(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleManualDownload()}
                                                className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                autoFocus
                                            />
                                            <input
                                                type="text"
                                                placeholder="Title (optional)"
                                                value={manualTitle}
                                                onChange={(e) => setManualTitle(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleManualDownload()}
                                                className="w-48 h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                            />
                                            <button
                                                onClick={handlePasteUrl}
                                                className="px-2 py-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors shrink-0"
                                                title="Paste from clipboard"
                                            >
                                                <Search className="w-4 h-4" />
                                            </button>

                                            {isYouTubeUrl(manualUrl) && (
                                                <button
                                                    onClick={() => openFormatModal({ url: manualUrl.trim(), title: manualTitle.trim() })}
                                                    disabled={!manualUrl.trim()}
                                                    className="px-3 py-2 bg-orange-600 text-white rounded-md text-sm font-medium hover:bg-orange-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0"
                                                    title="yt-dlp -F format list"
                                                >
                                                    <ListFilter className="w-4 h-4" />
                                                    Format List (-F)
                                                </button>
                                            )}

                                            <button
                                                onClick={() => handleManualDownload()}
                                                disabled={!manualUrl.trim()}
                                                className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                                            >
                                                Download
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setShowManualInput(false);
                                                    setManualUrl('');
                                                    setManualTitle('');
                                                }}
                                                className="px-2 py-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors shrink-0"
                                            >
                                                <XCircle className="w-4 h-4" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="flex-1 overflow-hidden">
                            {downloads.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center p-8">
                                    <div className="bg-muted p-3 rounded-full mb-3">
                                        <Inbox className="w-6 h-6 text-muted-foreground" />
                                    </div>
                                    <h3 className="text-base font-medium">No downloads yet</h3>
                                    <p className="text-sm text-muted-foreground max-w-sm mt-1">
                                        Send videos from the Chrome Extension to start downloading them directly to your PC.
                                    </p>
                                </div>
                            ) : (
                                <ScrollArea className="h-full">
                                    <div className="p-4 space-y-2">
                                        {downloads.map(dl => (
                                            <DownloadCard 
                                                key={dl.id} 
                                                item={dl} 
                                                logCount={downloadLogs[dl.id]?.length || 0}
                                                probeInfo={probes[dl.id]}
                                                onViewLogs={() => setLogModalItem(dl.id)}
                                                onDelete={() => setItemToDelete(dl.id)}
                                                onOpenFormats={() => openFormatModal({ id: dl.id, url: dl.url, title: dl.title })}
                                            />
                                        ))}
                                    </div>
                                </ScrollArea>
                            )}
                        </Card>
                    </div>

                    <div className={`flex-1 flex flex-col min-h-0 ${activeTab === "settings" ? "" : "hidden"}`}>
                        <SettingsView config={config} onChange={handleConfigChange} />
                    </div>
                </div>

                {/* Terminal Pane */}
                {showTerminal && (
                    <div 
                        style={{ height: `${terminalHeight}px` }}
                        className="border-t border-zinc-800 bg-zinc-950 w-full flex flex-col shrink-0 relative"
                    >
                        {/* Drag handle for resizing height */}
                        <div 
                            onMouseDown={(e) => {
                                e.preventDefault();
                                const startY = e.clientY;
                                const startH = terminalHeight;
                                const onMouseMove = (moveEvt: MouseEvent) => {
                                    const deltaY = startY - moveEvt.clientY;
                                    const newH = Math.min(Math.max(startH + deltaY, 120), window.innerHeight - 150);
                                    setTerminalHeight(newH);
                                };
                                const onMouseUp = () => {
                                    window.removeEventListener('mousemove', onMouseMove);
                                    window.removeEventListener('mouseup', onMouseUp);
                                };
                                window.addEventListener('mousemove', onMouseMove);
                                window.addEventListener('mouseup', onMouseUp);
                            }}
                            className="h-1.5 w-full bg-zinc-900 hover:bg-emerald-500/60 cursor-ns-resize transition-colors flex items-center justify-center group shrink-0 border-b border-zinc-800/60"
                            title="Drag to resize console height"
                        >
                            <div className="w-10 h-1 rounded-full bg-zinc-700 group-hover:bg-emerald-300 transition-colors" />
                        </div>

                        <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/90 border-b border-zinc-800/80">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                                </div>
                                <div className="h-3.5 w-px bg-zinc-700/50" />
                                <div className="flex items-center gap-2 text-zinc-300">
                                    <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                                    <span className="text-xs font-semibold tracking-wide">Live Console</span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-mono font-medium">{logs.length} lines</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={async () => {
                                        try {
                                            await navigator.clipboard.writeText(logs.join("\n"));
                                            setCopiedTerminalLogs(true);
                                            setTimeout(() => setCopiedTerminalLogs(false), 1500);
                                        } catch(e) {}
                                    }}
                                    className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 px-2.5 py-1 rounded transition-colors"
                                    title="Copy all live logs"
                                >
                                    {copiedTerminalLogs ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                    <span className="font-medium">{copiedTerminalLogs ? "Copied!" : "Copy All"}</span>
                                </button>
                                <button 
                                    onClick={() => setLogs([])} 
                                    className="text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 px-2.5 py-1 rounded transition-colors font-medium"
                                >
                                    Clear
                                </button>
                                <button 
                                    onClick={() => setShowTerminal(false)} 
                                    className="text-xs text-zinc-400 hover:text-rose-400 hover:bg-zinc-800/80 p-1 rounded transition-colors"
                                    title="Close Live Console"
                                >
                                    <XCircle className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                        <ScrollArea className="flex-1 p-3">
                            <div className="space-y-0.5 pb-4">
                                {logs.length === 0 ? (
                                    <div className="text-zinc-600 font-mono text-xs italic py-2">Waiting for console output...</div>
                                ) : (
                                    logs.map((log, i) => (
                                        <TerminalLine key={i} line={log} />
                                    ))
                                )}
                                <div ref={terminalEndRef} />
                            </div>
                        </ScrollArea>
                    </div>
                )}
            </main>

            {/* Delete Confirmation Modal */}
            {itemToDelete && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-card border shadow-xl rounded-xl max-w-md w-full p-6">
                        <h3 className="text-base font-semibold mb-1 flex items-center gap-2">
                            <Trash2 className="w-5 h-5 text-destructive" />
                            Delete Download
                        </h3>
                        <p className="text-sm text-muted-foreground mb-4">
                            Are you sure you want to remove <strong className="text-foreground">{downloads.find(d => d.id === itemToDelete)?.title || 'this download'}</strong> from the list?
                        </p>

                        <label className="flex items-start gap-3 p-3 rounded-lg border bg-muted/40 text-xs cursor-pointer mb-6 hover:bg-muted/70 transition-colors">
                            <input 
                                type="checkbox" 
                                checked={deleteFileFromDisk} 
                                onChange={(e) => setDeleteFileFromDisk(e.target.checked)}
                                className="rounded border-input text-destructive focus:ring-destructive mt-0.5 w-4 h-4"
                            />
                            <div className="flex flex-col gap-0.5 min-w-0">
                                <span className="font-semibold text-foreground">Also delete downloaded file from disk</span>
                                <span className="text-[11px] text-muted-foreground font-mono truncate">
                                    {downloads.find(d => d.id === itemToDelete)?.destination || 'File in Downloads folder'}
                                </span>
                            </div>
                        </label>

                        <div className="flex justify-end gap-2.5">
                            <button 
                                onClick={() => setItemToDelete(null)}
                                className="px-4 py-2 rounded-md hover:bg-muted transition-colors text-xs font-medium"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={() => {
                                    const d = downloads.find(x => x.id === itemToDelete);
                                    if (d && (d.status === 'downloading' || d.status === 'pending' || d.status === 'paused')) {
                                        CancelDownload(itemToDelete).catch(console.error);
                                    }
                                    RemoveDownload(itemToDelete, deleteFileFromDisk).catch(console.error);
                                    setItemToDelete(null);
                                }}
                                className="px-4 py-2 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors text-xs font-medium"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Process Log Modal */}
            {logModalItem && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-zinc-950 border border-zinc-800 shadow-2xl rounded-xl max-w-3xl w-full flex flex-col h-[65vh] overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3.5 bg-zinc-900 border-b border-zinc-800">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                                </div>
                                <div className="h-3.5 w-px bg-zinc-700/50" />
                                <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                                    <Terminal className="w-4 h-4 text-emerald-400" />
                                    Process Log History
                                </h3>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={async () => {
                                        try {
                                            const textToCopy = (downloadLogs[logModalItem] || []).join("\n");
                                            await navigator.clipboard.writeText(textToCopy);
                                            setCopiedProcessLogs(true);
                                            setTimeout(() => setCopiedProcessLogs(false), 1500);
                                        } catch(e) {}
                                    }}
                                    className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 px-2.5 py-1 rounded transition-colors"
                                    title="Copy all process logs"
                                >
                                    {copiedProcessLogs ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                    <span className="font-medium">{copiedProcessLogs ? "Copied!" : "Copy All"}</span>
                                </button>
                                <button 
                                    onClick={() => setLogModalItem(null)}
                                    className="p-1 text-zinc-400 hover:text-zinc-100 rounded-md hover:bg-zinc-800 transition-colors"
                                >
                                    <XCircle className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                        <ScrollArea className="flex-1 p-4 bg-zinc-950">
                            <div className="space-y-0.5 pb-4">
                                {(downloadLogs[logModalItem] || []).length === 0 ? (
                                    <div className="text-zinc-600 italic font-mono text-xs p-2">No logs collected for this download yet.</div>
                                ) : (
                                    (downloadLogs[logModalItem] || []).map((log, i) => (
                                        <TerminalLine key={i} line={log} />
                                    ))
                                )}
                            </div>
                        </ScrollArea>
                    </div>
                </div>
            )}

            {/* YouTube Format List (-F) Modal */}
            {formatModalTarget && (
                <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-card border shadow-2xl rounded-xl max-w-4xl w-full flex flex-col h-[80vh] overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/30">
                            <div>
                                <h3 className="text-base font-semibold flex items-center gap-2">
                                    <SlidersHorizontal className="w-5 h-5 text-orange-500" />
                                    YouTube Formats (yt-dlp -F)
                                </h3>
                                <p className="text-xs text-muted-foreground truncate max-w-xl mt-0.5" title={formatModalTarget.title || formatModalTarget.url}>
                                    {formatModalTarget.title || formatModalTarget.url}
                                </p>
                            </div>
                            <button 
                                onClick={() => setFormatModalTarget(null)}
                                className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
                            >
                                <XCircle className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Top Filters & Controls */}
                        <div className="flex flex-col gap-2.5 px-6 py-3 border-b bg-card">
                            {/* Presets */}
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-semibold text-muted-foreground mr-1">Quick Presets:</span>
                                <button
                                    onClick={() => setSelectedFormatId('bestvideo+bestaudio/best')}
                                    className={`px-2.5 py-1 text-xs rounded-md border font-medium transition-colors ${selectedFormatId === 'bestvideo+bestaudio/best' ? 'bg-orange-500 text-white border-orange-500' : 'bg-muted/40 hover:bg-muted text-foreground'}`}
                                >
                                    🌟 Best Available (Auto Video + Audio)
                                </button>
                                <button
                                    onClick={() => setSelectedFormatId('bestvideo[height<=1080]+bestaudio/best')}
                                    className={`px-2.5 py-1 text-xs rounded-md border font-medium transition-colors ${selectedFormatId === 'bestvideo[height<=1080]+bestaudio/best' ? 'bg-orange-500 text-white border-orange-500' : 'bg-muted/40 hover:bg-muted text-foreground'}`}
                                >
                                    🎬 1080p Max + Audio
                                </button>
                                <button
                                    onClick={() => setSelectedFormatId('bestaudio/best')}
                                    className={`px-2.5 py-1 text-xs rounded-md border font-medium transition-colors ${selectedFormatId === 'bestaudio/best' ? 'bg-orange-500 text-white border-orange-500' : 'bg-muted/40 hover:bg-muted text-foreground'}`}
                                >
                                    🎵 Best Audio Only
                                </button>
                                <button
                                    onClick={() => setSelectedFormatId('18')}
                                    className={`px-2.5 py-1 text-xs rounded-md border font-medium transition-colors ${selectedFormatId === '18' ? 'bg-orange-500 text-white border-orange-500' : 'bg-muted/40 hover:bg-muted text-foreground'}`}
                                >
                                    📱 360p Single File
                                </button>
                            </div>

                            {/* Category Filter & Checkbox */}
                            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-border/40">
                                <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg">
                                    <button
                                        onClick={() => setFormatCategory('all')}
                                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${formatCategory === 'all' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                    >
                                        All ({formatsList.length})
                                    </button>
                                    <button
                                        onClick={() => setFormatCategory('combined')}
                                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${formatCategory === 'combined' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                    >
                                        Combined Streams
                                    </button>
                                    <button
                                        onClick={() => setFormatCategory('video')}
                                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${formatCategory === 'video' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                    >
                                        Video Streams
                                    </button>
                                    <button
                                        onClick={() => setFormatCategory('audio')}
                                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${formatCategory === 'audio' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                    >
                                        Audio Streams
                                    </button>
                                </div>

                                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                                    <input 
                                        type="checkbox" 
                                        checked={autoAppendAudio} 
                                        onChange={(e) => setAutoAppendAudio(e.target.checked)}
                                        className="rounded border-input text-orange-500 focus:ring-orange-500"
                                    />
                                    <span>Auto-append <code className="text-orange-500 font-mono">+bestaudio</code> to Video streams</span>
                                </label>
                            </div>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 overflow-auto p-4 bg-muted/10">
                            {formatLoading ? (
                                <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
                                    <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                                    <span className="text-sm font-medium">Extracting available formats using yt-dlp...</span>
                                </div>
                            ) : formatError ? (
                                <div className="h-full flex flex-col items-center justify-center text-destructive p-6 text-center">
                                    <XCircle className="w-10 h-10 mb-2" />
                                    <span className="font-semibold text-sm">Failed to fetch formats</span>
                                    <span className="text-xs text-muted-foreground max-w-md mt-1">{formatError}</span>
                                </div>
                            ) : filteredFormats.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                                    No formats matching current filter.
                                </div>
                            ) : (
                                <table className="w-full text-left border-collapse text-xs font-mono">
                                    <thead>
                                        <tr className="border-b bg-muted/40 text-muted-foreground font-sans">
                                            <th className="p-2.5 w-10">Select</th>
                                            {renderFormatSortHeader("ID", "formatId")}
                                            {renderFormatSortHeader("EXT", "ext")}
                                            {renderFormatSortHeader("RESOLUTION", "resolution")}
                                            {renderFormatSortHeader("FPS", "fps")}
                                            {renderFormatSortHeader("FILESIZE", "filesize")}
                                            {renderFormatSortHeader("TBR", "tbr")}
                                            {renderFormatSortHeader("VCODEC", "vcodec")}
                                            {renderFormatSortHeader("ACODEC", "acodec")}
                                            {renderFormatSortHeader("NOTE", "formatNote")}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {sortedFormats.map((f) => {
                                            const isSelected = selectedFormatId === f.formatId;
                                            const isVideoOnly = f.vcodec !== 'none' && f.vcodec !== '' && (f.acodec === 'none' || f.acodec === '');
                                            const isAudioOnly = (f.vcodec === 'none' || f.vcodec === '') && f.acodec !== 'none' && f.acodec !== '';

                                            return (
                                                <tr 
                                                    key={f.formatId}
                                                    onClick={() => setSelectedFormatId(f.formatId)}
                                                    className={`cursor-pointer transition-colors ${isSelected ? 'bg-orange-500/10 dark:bg-orange-500/20 font-semibold' : 'hover:bg-muted/50'}`}
                                                >
                                                    <td className="p-2.5 text-center">
                                                        <input 
                                                            type="radio" 
                                                            name="yt_format" 
                                                            checked={isSelected}
                                                            onChange={() => setSelectedFormatId(f.formatId)}
                                                            className="text-orange-500 focus:ring-orange-500"
                                                        />
                                                    </td>
                                                    <td className="p-2.5 font-bold text-orange-600 dark:text-orange-400">{f.formatId}</td>
                                                    <td className="p-2.5">{f.ext}</td>
                                                    <td className="p-2.5">
                                                        {f.resolution}
                                                        {isVideoOnly && (
                                                            <Badge variant="outline" className="ml-1 text-[9px] py-0 px-1 text-blue-500 border-blue-500/30">
                                                                {autoAppendAudio ? 'video + audio' : 'video only'}
                                                            </Badge>
                                                        )}
                                                        {isAudioOnly && <Badge variant="outline" className="ml-1 text-[9px] py-0 px-1 text-green-500 border-green-500/30">audio</Badge>}
                                                    </td>
                                                    <td className="p-2.5">{f.fps > 0 ? f.fps : '-'}</td>
                                                    <td className="p-2.5">{formatBytes(f.filesize)}</td>
                                                    <td className="p-2.5">{f.tbr > 0 ? `${f.tbr.toFixed(0)}k` : '-'}</td>
                                                    <td className="p-2.5 text-muted-foreground max-w-[120px] truncate" title={f.vcodec}>{f.vcodec}</td>
                                                    <td className="p-2.5 text-muted-foreground max-w-[120px] truncate" title={f.acodec}>{f.acodec}</td>
                                                    <td className="p-2.5 text-muted-foreground">{f.formatNote || '-'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Footer Controls */}
                        <div className="flex items-center justify-between px-6 py-4 border-t bg-card">
                            <div className="text-xs text-muted-foreground">
                                {selectedFormatId ? (
                                    <span>
                                        Selected Format: <strong className="text-orange-500 font-mono">{selectedFormatId}</strong>
                                        {autoAppendAudio && formatsList.find(f => f.formatId === selectedFormatId)?.vcodec !== 'none' && formatsList.find(f => f.formatId === selectedFormatId)?.acodec === 'none' && (
                                            <span className="text-blue-500 font-medium"> (+bestaudio auto-merged into MP4)</span>
                                        )}
                                    </span>
                                ) : (
                                    <span>Click on a format row or preset above to select</span>
                                )}
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setFormatModalTarget(null)}
                                    className="px-4 py-2 rounded-md hover:bg-muted text-xs font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={applySelectedFormat}
                                    disabled={!selectedFormatId}
                                    className="px-4 py-2 rounded-md bg-orange-600 text-white hover:bg-orange-500 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                                >
                                    <Check className="w-4 h-4" />
                                    Start Download
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function SettingsView({ config, onChange }: { config: AppConfig | null, onChange: (cfg: AppConfig) => void }) {
    if (!config) return <div className="p-4 text-muted-foreground">Loading settings...</div>;

    return (
        <div className="flex-1 flex flex-col">
            <div className="mb-3 shrink-0">
                <h2 className="text-xl font-semibold">Settings</h2>
                <p className="text-sm text-muted-foreground">Configure application preferences.</p>
            </div>
            <Card className="flex-1 overflow-y-auto">
                <CardContent className="p-6 max-w-2xl">
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-base font-medium">Download Preferences</h3>
                            <div className="mt-3 space-y-4">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="space-y-0.5">
                                        <label className="text-sm font-medium leading-none">Concurrent Connections</label>
                                        <p className="text-xs text-muted-foreground">Number of simultaneous fragments to download per video.</p>
                                    </div>
                                    <input 
                                        type="number" 
                                        min="1" 
                                        max="32" 
                                        value={config.concurrentFragments}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value) || 1;
                                            onChange({ ...config, concurrentFragments: val });
                                        }}
                                        className="flex h-9 w-20 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    />
                                </div>

                                <div className="flex items-center justify-between gap-4">
                                    <div className="space-y-0.5">
                                        <label className="text-sm font-medium leading-none">Server Probe</label>
                                        <p className="text-xs text-muted-foreground">Automatically detect server speed and adjust connections.</p>
                                    </div>
                                    <div
                                        onClick={() => onChange({ ...config, enableProbe: !config.enableProbe })}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${config.enableProbe ? 'bg-primary' : 'bg-muted'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${config.enableProbe ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </div>
                                </div>

                                <div className="flex items-center justify-between gap-4">
                                    <div className="space-y-0.5">
                                        <label className="text-sm font-medium leading-none">Probe Size (MB)</label>
                                        <p className="text-xs text-muted-foreground">Amount of data to download for speed testing.</p>
                                    </div>
                                    <input 
                                        type="number" 
                                        min="1" 
                                        max="20" 
                                        value={config.probeSizeMB}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value) || 5;
                                            onChange({ ...config, probeSizeMB: val });
                                        }}
                                        className="flex h-9 w-20 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    />
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-base font-medium">Custom Dependency Paths</h3>
                            <p className="text-xs text-muted-foreground mt-1">Paths to explicitly selected external executables.</p>
                            
                            <div className="mt-3 space-y-2">
                                {Object.entries(config.customPaths || {}).map(([name, path]) => (
                                    <div key={name} className="flex flex-col gap-1 p-3 rounded-md border bg-muted/30">
                                        <span className="text-sm font-medium capitalize">{name}</span>
                                        <span className="text-xs font-mono text-muted-foreground break-all">{path}</span>
                                    </div>
                                ))}
                                {Object.keys(config.customPaths || {}).length === 0 && (
                                    <div className="text-sm text-muted-foreground">No custom paths configured. Tools will be auto-downloaded to ~/.vdm/bin.</div>
                                )}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function DownloadCard({ item, logCount = 0, probeInfo, onViewLogs, onDelete, onOpenFormats }: { item: DownloadItem, logCount?: number, probeInfo?: ProbeInfo, onViewLogs?: () => void, onDelete?: () => void, onOpenFormats?: () => void }) {
    const filename = getFilenameFromUrl(item.url);
    const [expanded, setExpanded] = useState(false);
    const [stats, setStats] = useState({ avgSpeed: '', duration: '' });
    const isYouTube = isYouTubeUrl(item.url);
    
    let badgeVariant: "default" | "secondary" | "destructive" | "outline" = "secondary";
    let statusText = item.status;
    let progress = item.progress || 0;
    
    if (item.status === 'pending') {
        statusText = 'Pending';
        badgeVariant = 'secondary';
    } else if (item.status === 'downloading') {
        statusText = 'Downloading';
        badgeVariant = 'default';
    } else if (item.status === 'paused') {
        statusText = 'Paused';
        badgeVariant = 'outline';
    } else if (item.status === 'completed') {
        statusText = 'Completed';
        badgeVariant = 'outline';
        progress = 100;
    } else if (item.status === 'error') {
        statusText = 'Error';
        badgeVariant = 'destructive';
    } else if (item.status === 'cancelled') {
        statusText = 'Cancelled';
        badgeVariant = 'secondary';
    }

    const showProgressInfo = item.status === 'downloading' || item.status === 'completed' || item.status === 'paused';

    // Probe status display
    const renderProbeStatus = () => {
        if (!probeInfo) return null;
        
        if (probeInfo.status === 'probing') {
            const elapsed = Math.floor((Date.now() - probeInfo.startTime) / 1000);
            return (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Checking server...</span>
                    <span className="text-[10px] text-muted-foreground/70">{elapsed}s</span>
                </div>
            );
        }
        
        if (probeInfo.status === 'complete') {
            return (
                <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                    <Check className="w-3 h-3" />
                    <span>{formatSpeed(probeInfo.speed)}</span>
                    <span className="text-muted-foreground/70">•</span>
                    <span>{probeInfo.threads} threads</span>
                </div>
            );
        }
        
        return null;
    };

    return (
        <Card className="overflow-hidden transition-all hover:shadow-md relative group flex flex-col">
            <CardContent className="p-4 flex flex-col gap-2.5">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${item.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
                        <FileVideo className="w-5 h-5" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                            <h4 className="font-medium text-sm truncate pr-4" title={item.url}>{item.title || filename}</h4>
                            <div className="flex items-center gap-1.5">
                                {item.formatId && (
                                    <Badge variant="outline" className="text-[10px] shrink-0 border-orange-500/50 text-orange-600 dark:text-orange-400 font-mono">
                                        -f {item.formatId}
                                    </Badge>
                                )}
                                <Badge variant={badgeVariant} className="text-[10px] shrink-0">
                                    {statusText}
                                </Badge>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                                {item.type.toUpperCase()}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                                {item.totalSize || item.size}
                            </span>
                            {logCount > 0 && (
                                <button onClick={onViewLogs} className="flex items-center gap-1 text-[10px] text-orange-500 hover:text-orange-400 hover:bg-orange-500/10 px-1.5 py-0.5 rounded transition-colors" title="View Process Logs">
                                    <Terminal className="w-3 h-3" />
                                    {logCount}
                                </button>
                            )}
                            {item.speed && (item.status === 'downloading') && (
                                <>
                                    <span className="text-muted-foreground/30">•</span>
                                    <span className="text-xs text-primary font-medium">{item.speed}</span>
                                </>
                            )}
                            {stats.avgSpeed && (
                                <>
                                    <span className="text-muted-foreground/30">•</span>
                                    <span className="text-xs text-muted-foreground" title="Average Speed">Avg: {stats.avgSpeed}</span>
                                </>
                            )}
                            {stats.duration && (
                                <>
                                    <span className="text-muted-foreground/30">•</span>
                                    <span className="text-xs text-muted-foreground" title="Elapsed Time">⌚ {stats.duration}</span>
                                </>
                            )}
                        </div>
                        {item.statusMsg && (
                            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground/80 font-mono italic">
                                {item.status === 'downloading' && (
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse shrink-0"></span>
                                )}
                                <span className="truncate">{item.statusMsg}</span>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-1">
                        {isYouTube && (
                            <button
                                onClick={onOpenFormats}
                                className="p-1.5 text-orange-600 dark:text-orange-400 hover:bg-orange-500/10 rounded-md transition-colors flex items-center gap-1 text-xs font-medium"
                                title="Inspect & Change YouTube Formats (-F)"
                            >
                                <ListFilter className="w-4 h-4" />
                                <span className="hidden sm:inline">Format</span>
                            </button>
                        )}

                        <button 
                            onClick={() => setExpanded(!expanded)}
                            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                            title="Toggle Chart"
                        >
                            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>

                        {item.status === 'completed' && (
                            <button 
                                onClick={() => ShowInFolder(item.id)}
                                className="p-1.5 text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10 rounded-md transition-colors"
                                title="Show in Folder"
                            >
                                <FolderOpen className="w-4 h-4" />
                            </button>
                        )}
                        
                        {(item.status === 'downloading' || item.status === 'pending') && (
                            <div className="flex items-center gap-1">
                                <button 
                                    onClick={() => {
                                        setDownloads(prev => prev.map(d => d.id === item.id ? { ...d, status: 'paused', speed: '', statusMsg: 'Paused' } : d));
                                        PauseDownload(item.id).catch(console.error);
                                    }}
                                    className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
                                    title="Pause Download"
                                >
                                    <Pause className="w-4 h-4 fill-current" />
                                </button>
                                <button 
                                    onClick={() => { if (onDelete) onDelete(); }}
                                    className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                                    title="Cancel Download"
                                >
                                    <XCircle className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                        {item.status === 'paused' && (
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => ResumeDownload(item.id).catch(console.error)}
                                    className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
                                    title="Resume"
                                >
                                    <Play className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => { if (onDelete) onDelete(); }}
                                    className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                                    title="Cancel & Delete File"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        )}

                        {(item.status === 'error' || item.status === 'cancelled') && (
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => RetryDownload(item.id).catch(console.error)}
                                    className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
                                    title="Retry"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => { if (onDelete) onDelete(); }}
                                    className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                                    title="Remove completely"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        )}

                        {item.status === 'completed' && (
                            <button
                                onClick={() => { if (onDelete) onDelete(); }}
                                className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                                title="Remove from list"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Probe Status */}
                {renderProbeStatus()}

                {(showProgressInfo || item.status === 'error' || item.status === 'cancelled') && (
                    <div className="flex items-center gap-3">
                        <Progress value={progress} className={`h-1.5 flex-1 ${item.status === 'error' ? 'opacity-50' : ''}`} />
                        <span className="text-xs text-muted-foreground w-12 text-right font-mono">
                            {progress.toFixed(1)}%
                        </span>
                    </div>
                )}
            </CardContent>

            {/* Collapsible Chart Area */}
            {expanded && (
                <div className="h-[200px] border-t bg-muted/10">
                    <SpeedChart 
                        speedStr={item.speed} 
                        downloadedSize={item.downloadedSize}
                        totalSize={item.totalSize || item.size}
                        progress={progress}
                        isDownloading={item.status === 'downloading'} 
                        onStatsUpdate={(avg, dur) => setStats({ avgSpeed: avg, duration: dur })} 
                    />
                </div>
            )}
            {!expanded && item.status === 'downloading' && (
                <div className="hidden">
                    <SpeedChart 
                        speedStr={item.speed} 
                        downloadedSize={item.downloadedSize}
                        totalSize={item.totalSize || item.size}
                        progress={progress}
                        isDownloading={item.status === 'downloading'} 
                        onStatsUpdate={(avg, dur) => setStats({ avgSpeed: avg, duration: dur })} 
                    />
                </div>
            )}
        </Card>
    );
}
