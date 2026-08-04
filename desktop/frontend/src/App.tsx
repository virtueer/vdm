import React, { useEffect, useState, useRef } from "react";
import { Events } from "@wailsio/runtime";
import { GetDownloads, GetConfig, SaveConfig, CancelDownload } from "../bindings/vdm/app";
import type { AppConfig } from "../bindings/vdm/models";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Inbox, FileVideo, Activity, Settings, Terminal, DownloadCloud, XCircle } from "lucide-react";

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
    const terminalEndRef = useRef<HTMLDivElement>(null);

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
            Events.On("log", (evt: any) => {
                if (evt.data) {
                    setLogs(prev => {
                        const newLogs = [...prev, evt.data];
                        // Limit to 1000 lines
                        if (newLogs.length > 1000) return newLogs.slice(newLogs.length - 1000);
                        return newLogs;
                    });
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

    return (
        <div className="flex flex-col h-full bg-background dark:bg-[#09090b]">
            <header className="flex items-center justify-between px-6 py-4 border-b bg-card shrink-0">
                <div className="flex items-center gap-3">
                    <div className="bg-primary p-2 rounded-xl text-primary-foreground">
                        <Activity className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-lg font-semibold leading-none tracking-tight">VDM Desktop</h1>
                        <p className="text-xs text-muted-foreground mt-1">Virtueer Media Grabber</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 mr-4 bg-muted p-1 rounded-lg">
                        <button 
                            onClick={() => setActiveTab("downloads")}
                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'downloads' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            <DownloadCloud className="w-4 h-4" />
                            Downloads
                        </button>
                        <button 
                            onClick={() => setActiveTab("settings")}
                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'settings' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            <Settings className="w-4 h-4" />
                            Settings
                        </button>
                    </div>

                    <button 
                        onClick={() => setShowTerminal(!showTerminal)}
                        className={`p-2 rounded-md transition-colors ${showTerminal ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                        title="Toggle Terminal Logs"
                    >
                        <Terminal className="w-5 h-5" />
                    </button>

                    <div className="flex items-center gap-2 ml-2">
                        <span className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                        </span>
                        <span className="text-sm font-medium text-muted-foreground hidden sm:inline-block">Connected</span>
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-hidden flex flex-col relative">
                {/* Main Content Area */}
                <div className={`w-full px-6 flex flex-col transition-all duration-300 ${showTerminal ? 'h-1/2 pb-2 pt-6' : 'h-full py-6'}`}>
                    {activeTab === "downloads" ? (
                        <>
                            <div className="mb-4 shrink-0">
                                <h2 className="text-2xl font-bold tracking-tight">Downloads</h2>
                                <p className="text-muted-foreground">Monitor and manage your media downloads.</p>
                            </div>

                            <Card className="flex-1 overflow-hidden border-dashed shadow-none">
                                {downloads.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-center p-8">
                                        <div className="bg-muted p-4 rounded-full mb-4">
                                            <Inbox className="w-8 h-8 text-muted-foreground" />
                                        </div>
                                        <h3 className="text-lg font-semibold">No downloads yet</h3>
                                        <p className="text-sm text-muted-foreground max-w-sm mt-2">
                                            Send videos from the VDM Chrome Extension to start downloading them directly to your PC.
                                        </p>
                                    </div>
                                ) : (
                                    <ScrollArea className="h-full">
                                        <div className="p-4 space-y-3">
                                            {downloads.map(dl => (
                                                <DownloadCard key={dl.id} item={dl} />
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
                    <div className="h-1/2 border-t bg-black w-full flex flex-col shrink-0 animate-in slide-in-from-bottom-8">
                        <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-zinc-950">
                            <div className="flex items-center gap-2 text-zinc-400">
                                <Terminal className="w-4 h-4" />
                                <span className="text-xs font-medium uppercase tracking-wider">Live Logs</span>
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
        </div>
    );
}

function SettingsView({ config, onChange }: { config: AppConfig | null, onChange: (cfg: AppConfig) => void }) {
    if (!config) return <div className="p-4 text-muted-foreground">Loading settings...</div>;

    return (
        <div className="flex-1 flex flex-col">
            <div className="mb-4 shrink-0">
                <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
                <p className="text-muted-foreground">Configure application preferences.</p>
            </div>
            <Card className="flex-1 shadow-none overflow-y-auto">
                <CardContent className="p-6 max-w-2xl">
                    <div className="space-y-8">
                        <div>
                            <h3 className="text-lg font-medium">Download Preferences</h3>
                            <div className="mt-4 space-y-4">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="space-y-0.5">
                                        <label className="text-sm font-medium leading-none">Concurrent Connections</label>
                                        <p className="text-[13px] text-muted-foreground">Number of simultaneous fragments to download per video. Higher values are faster but may cause rate-limit bans (HTTP 429).</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="number" 
                                            min="1" 
                                            max="32" 
                                            value={config.concurrentFragments}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value) || 1;
                                                onChange({ ...config, concurrentFragments: val });
                                            }}
                                            className="flex h-9 w-20 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-lg font-medium">Custom Dependency Paths</h3>
                            <p className="text-[13px] text-muted-foreground mt-1 mb-4">Paths to explicitly selected external executables.</p>
                            
                            <div className="space-y-3">
                                {Object.entries(config.customPaths || {}).map(([name, path]) => (
                                    <div key={name} className="flex flex-col gap-1.5 p-3 rounded-lg border bg-muted/40">
                                        <span className="text-sm font-semibold capitalize">{name}</span>
                                        <span className="text-xs font-mono text-muted-foreground break-all">{path}</span>
                                    </div>
                                ))}
                                {Object.keys(config.customPaths || {}).length === 0 && (
                                    <div className="text-sm text-muted-foreground italic">No custom paths configured. Tools will be auto-downloaded to ~/.vdm/bin.</div>
                                )}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function DownloadCard({ item }: { item: DownloadItem }) {
    const filename = getFilenameFromUrl(item.url);
    
    let badgeVariant: "default" | "secondary" | "destructive" | "outline" = "secondary";
    let statusText = item.status;
    let progress = item.progress || 0;
    
    if (item.status === 'pending') {
        statusText = 'Pending';
        badgeVariant = 'secondary';
    } else if (item.status === 'downloading') {
        statusText = 'Downloading...';
        badgeVariant = 'default';
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

    const showProgressInfo = item.status === 'downloading' || item.status === 'completed';

    return (
        <Card className="overflow-hidden transition-all hover:shadow-md">
            <CardContent className="p-4 flex flex-col gap-3">
                <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-lg ${item.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
                        <FileVideo className="w-6 h-6" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                            <h4 className="font-medium text-sm truncate pr-4" title={item.url}>{filename}</h4>
                            <Badge variant={badgeVariant} className="text-[10px] shrink-0">
                                {statusText}
                            </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                            <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-normal rounded-sm">
                                {item.type.toUpperCase()}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                                {item.totalSize || item.size}
                            </span>
                            {item.speed && item.status === 'downloading' && (
                                <>
                                    <span className="text-muted-foreground/50">•</span>
                                    <span className="text-xs text-primary font-medium">{item.speed}</span>
                                </>
                            )}
                        </div>
                    </div>

                    {(item.status === 'pending' || item.status === 'downloading') && (
                        <button 
                            onClick={() => CancelDownload(item.id)}
                            className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                            title="Cancel Download"
                        >
                            <XCircle className="w-5 h-5" />
                        </button>
                    )}
                </div>

                {(showProgressInfo || item.status === 'error' || item.status === 'cancelled') && (
                    <div className="flex items-center gap-3">
                        <Progress value={progress} className={`h-1.5 flex-1 ${item.status === 'error' ? 'opacity-50' : ''}`} />
                        <span className="text-xs text-muted-foreground w-12 text-right font-mono">
                            {progress.toFixed(1)}%
                        </span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
