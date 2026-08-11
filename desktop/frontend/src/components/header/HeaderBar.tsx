import React from "react";
import { Activity, DownloadCloud, Settings, Terminal } from "lucide-react";

interface HeaderBarProps {
    activeTab: "downloads" | "settings";
    setActiveTab: (tab: "downloads" | "settings") => void;
    showTerminal: boolean;
    setShowTerminal: (show: boolean) => void;
}

export function HeaderBar({ activeTab, setActiveTab, showTerminal, setShowTerminal }: HeaderBarProps) {
    return (
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
    );
}
