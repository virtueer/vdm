import React from "react";
import { Activity, DownloadCloud, Settings, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
                <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as "downloads" | "settings")}>
                    <TabsList className="bg-muted/50 p-0.5">
                        <TabsTrigger value="downloads" className="gap-2 text-xs">
                            <DownloadCloud className="w-3.5 h-3.5" />
                            Downloads
                        </TabsTrigger>
                        <TabsTrigger value="settings" className="gap-2 text-xs">
                            <Settings className="w-3.5 h-3.5" />
                            Settings
                        </TabsTrigger>
                    </TabsList>
                </Tabs>

                <Button 
                    variant={showTerminal ? "secondary" : "ghost"}
                    size="icon"
                    onClick={() => setShowTerminal(!showTerminal)}
                    className={showTerminal ? "bg-primary/10 text-primary" : "text-muted-foreground"}
                    title="Toggle Terminal Logs"
                >
                    <Terminal className="w-4 h-4" />
                </Button>

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
