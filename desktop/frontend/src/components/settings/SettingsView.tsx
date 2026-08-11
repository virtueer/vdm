import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { AppConfig } from "../../../bindings/vdm/models";
import { SaveConfig } from "../../../bindings/vdm/app";

interface SettingsViewProps {
    config: AppConfig | null;
    setConfig: (cfg: AppConfig) => void;
}

export function SettingsView({ config, setConfig }: SettingsViewProps) {
    if (!config) return <div className="p-4 text-muted-foreground">Loading settings...</div>;

    const handleConfigChange = (newConfig: AppConfig) => {
        setConfig(newConfig);
        SaveConfig(newConfig).catch(console.error);
    };

    return (
        <div className="flex-1 flex flex-col min-h-0">
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
                                            handleConfigChange({ ...config, concurrentFragments: val });
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
                                        onClick={() => handleConfigChange({ ...config, enableProbe: !config.enableProbe })}
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
                                            handleConfigChange({ ...config, probeSizeMB: val });
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
