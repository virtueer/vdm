import React, { useEffect, useState, useRef } from "react";
import { Events } from "@wailsio/runtime";
import { GetDownloads, GetConfig, SaveConfig, CancelDownload, PauseDownload, ResumeDownload, RemoveDownload, RetryDownload, ShowInFolder } from "../bindings/vdm/app";
import type { AppConfig } from "../bindings/vdm/models";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Inbox, FileVideo, Activity, Settings, Terminal, DownloadCloud, XCircle, Pause, Play, Trash2, ChevronDown, ChevronUp, RefreshCw, FolderOpen, Zap, Search, Loader2, Check } from "lucide-react";
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

export default function App() {
    const [downloads, setDownloads] = useState<DownloadItem[]>([]);
    const [config, setConfig] = useState<AppConfig | null>(null);
    const [activeTab, setActiveTab] = useState<"downloads" | "settings">("downloads");
    const [showTerminal, setShowTerminal] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [downloadLogs, setDownloadLogs] = useState<Record<string, string[]>>({});
    const [itemToDelete, setItemToDelete] = useState<string | null>(null);
    const [logModalItem, setLogModalItem] = useState<string | null>(null);
    const [probes, setProbes] = useState<Record<string, ProbeInfo>>({});
    const [manualUrl, setManualUrl] = useState("");
    const [manualTitle, setManualTitle] = useState("");
    const [showManualInput, setShowManualInput] = useState(false);
    const terminalEndRef = useRef<HTMLDivElement>(null);

    const activeCount = downloads.filter(d => d.status === 'downloading').length;
    const queuedCount = downloads.filter(d => d.status === 'pending').length;
    const completedCount = downloads.filter(d => d.status === 'completed').length;
    const erroredCount = downloads.filter(d => d.status === 'error' || d.status === 'cancelled').length;

    useEffect(() => {
        // Load initial downloads & config
        GetDownloads().then((data: any) => {
            if (Array.isArray(data)) setDownloads(data);
        }).catch(console.error);

        GetConfig().then((cfg) => {
            setConfig(cfg);
        }).catch(console.error);

        // Listen for events
        const unsubs = [
            Events.On("new_download", (evt: any) => {
                if (evt.data) {
                    setDownloads(prev => {
                        if (prev.find(d => d.id === evt.data.id)) return prev;
                        return [evt.data, ...prev];
                    });
                }
            }),
            Events.On("download_updated", (evt: any) => {
                if (evt.data) {
                    setDownloads(prev => prev.map(d => {
                        if (d.id === evt.data.id) {
                            // Preserve progress/speed/size from previous state
                            // so that error/completed status doesn't reset the progress bar
                            return {
                                ...d,
                                ...evt.data,
                                progress: d.progress ?? evt.data.progress,
                                speed: d.speed,
                                downloadedSize: d.downloadedSize,
                                totalSize: d.totalSize ?? evt.data.totalSize,
                            };
                        }
                        return d;
                    }));
                }
            }),
            Events.On("download_progress", (evt: any) => {
                if (evt.data) {
                    setDownloads(prev => prev.map(d => {
                        if (d.id === evt.data.id) {
                            return {
                                ...d,
                                progress: parseFloat(evt.data.percentage) || d.progress,
                                speed: evt.data.speed || d.speed,
                                downloadedSize: evt.data.downloaded || d.downloadedSize,
                                totalSize: evt.data.total || d.totalSize
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
                        // Limit to 1000 lines
                        if (newLogs.length > 1000) return newLogs.slice(newLogs.length - 1000);
                        return newLogs;
                    });
                }
            }),
            Events.On("download_log", (evt: any) => {
                if (evt.data && evt.data.id && evt.data.message) {
                    setDownloadLogs(prev => {
                        const existingLogs = prev[evt.data.id] || [];
                        const newLogs = [...existingLogs, evt.data.message];
                        if (newLogs.length > 500) return { ...prev, [evt.data.id]: newLogs.slice(newLogs.length - 500) };
                        return { ...prev, [evt.data.id]: newLogs };
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
        if (showTerminal && terminalEndRef.current) {
            terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [logs, showTerminal]);

    const handleConfigChange = (newConfig: AppConfig) => {
        setConfig(newConfig);
        SaveConfig(newConfig).catch(console.error);
    };

    const handleManualDownload = () => {
        if (!manualUrl.trim()) return;
        
        fetch('http://localhost:9614/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: manualUrl.trim(),
                type: 'manual',
                size: 'Unknown',
                pageUrl: '',
                title: manualTitle.trim() || ''
            })
        }).then(res => {
            if (res.ok) {
                setManualUrl('');
                setManualTitle('');
                setShowManualInput(false);
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
                <div className={`w-full px-6 flex flex-col transition-all duration-300 ${showTerminal ? 'h-1/2 pb-2 pt-4' : 'h-full py-4'}`}>
                    {activeTab === "downloads" ? (
                        <>
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
                                        <span className="font-medium">{queuedCount}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-muted-foreground">Done:</span>
                                        <span className="font-medium text-green-500">{completedCount}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-muted-foreground">Failed:</span>
                                        <span className="font-medium text-destructive">{erroredCount}</span>
                                    </div>
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
                                                <button
                                                    onClick={handleManualDownload}
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
                                                />
                                            ))}
                                        </div>
                                    </ScrollArea>
                                )}
                            </Card>
                        </>
                    ) : (
                        <SettingsView config={config} onChange={handleConfigChange} />
                    )}
                </div>

                {/* Terminal Pane */}
                {showTerminal && (
                    <div className="h-1/2 border-t bg-black w-full flex flex-col shrink-0">
                        <div className="flex items-center justify-between px-4 py-2 border-b bg-card">
                            <div className="flex items-center gap-2 text-zinc-400">
                                <Terminal className="w-3.5 h-3.5" />
                                <span className="text-xs font-medium">Live Logs</span>
                            </div>
                            <button onClick={() => setLogs([])} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                                Clear
                            </button>
                        </div>
                        <ScrollArea className="flex-1 p-4">
                            <div className="font-mono text-[11px] leading-tight text-green-400 pb-4">
                                {logs.map((log, i) => (
                                    <div key={i} className="whitespace-pre-wrap break-all">{log}</div>
                                ))}
                                <div ref={terminalEndRef} />
                            </div>
                        </ScrollArea>
                    </div>
                )}
            </main>

            {/* Modals */}
            {itemToDelete && (
                <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-card border shadow-lg rounded-lg max-w-md w-full p-6">
                        <h3 className="text-base font-semibold mb-2">Delete Confirmation</h3>
                        <p className="text-muted-foreground text-sm mb-6">
                            Are you sure you want to permanently delete this item? This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button 
                                onClick={() => setItemToDelete(null)}
                                className="px-4 py-2 rounded-md hover:bg-muted transition-colors text-sm font-medium"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={() => {
                                    const d = downloads.find(x => x.id === itemToDelete);
                                    if (d && (d.status === 'downloading' || d.status === 'pending' || d.status === 'paused')) {
                                        CancelDownload(itemToDelete).catch(console.error);
                                    } else {
                                        RemoveDownload(itemToDelete).catch(console.error);
                                    }
                                    setItemToDelete(null);
                                }}
                                className="px-4 py-2 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors text-sm font-medium"
                            >
                                Yes, Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {logModalItem && (
                <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-card border shadow-lg rounded-lg max-w-2xl w-full flex flex-col h-[60vh]">
                        <div className="flex items-center justify-between p-4 border-b">
                            <h3 className="text-base font-semibold flex items-center gap-2">
                                <Terminal className="w-4 h-4 text-muted-foreground" />
                                Process Logs
                            </h3>
                            <button 
                                onClick={() => setLogModalItem(null)}
                                className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
                            >
                                <XCircle className="w-4 h-4" />
                            </button>
                        </div>
                        <ScrollArea className="flex-1 p-4 bg-black rounded-b-lg">
                            <div className="font-mono text-[11px] leading-tight text-zinc-300 pb-4">
                                {(downloadLogs[logModalItem] || []).length === 0 ? (
                                    <div className="text-zinc-500">No logs collected for this download yet.</div>
                                ) : (
                                    (downloadLogs[logModalItem] || []).map((log, i) => (
                                        <div key={i} className="whitespace-pre-wrap break-all border-b border-zinc-800/50 py-1">{log}</div>
                                    ))
                                )}
                            </div>
                        </ScrollArea>
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

function DownloadCard({ item, logCount = 0, probeInfo, onViewLogs, onDelete }: { item: DownloadItem, logCount?: number, probeInfo?: ProbeInfo, onViewLogs?: () => void, onDelete?: () => void }) {
    const filename = getFilenameFromUrl(item.url);
    const [expanded, setExpanded] = useState(false);
    const [stats, setStats] = useState({ avgSpeed: '', duration: '' });
    
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
                            <Badge variant={badgeVariant} className="text-[10px] shrink-0">
                                {statusText}
                            </Badge>
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
                    </div>

                    <div className="flex items-center gap-1">
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
                                    onClick={() => PauseDownload(item.id)}
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
            <div className={`transition-all duration-300 ease-in-out overflow-hidden border-t ${expanded ? 'h-[200px] opacity-100' : 'h-0 opacity-0'}`}>
                <SpeedChart speedStr={item.speed} isDownloading={item.status === 'downloading'} onStatsUpdate={(avg, dur) => setStats({ avgSpeed: avg, duration: dur })} />
            </div>
        </Card>
    );
}
