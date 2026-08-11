import React from "react";
import { Button } from "@/components/ui/button";

interface FormatPresetsProps {
    selectedFormatId: string | null;
    setSelectedFormatId: (id: string) => void;
    formatCategory: 'all' | 'combined' | 'video' | 'audio';
    setFormatCategory: (cat: 'all' | 'combined' | 'video' | 'audio') => void;
    autoAppendAudio: boolean;
    setAutoAppendAudio: (val: boolean) => void;
    totalFormatsCount: number;
}

export function FormatPresets({
    selectedFormatId,
    setSelectedFormatId,
    formatCategory,
    setFormatCategory,
    autoAppendAudio,
    setAutoAppendAudio,
    totalFormatsCount
}: FormatPresetsProps) {
    return (
        <div className="flex flex-col gap-2.5 px-6 py-3 border-b bg-card">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground mr-1">Quick Presets:</span>
                <Button
                    size="sm"
                    variant={selectedFormatId === 'bestvideo+bestaudio/best' ? 'default' : 'outline'}
                    onClick={() => setSelectedFormatId('bestvideo+bestaudio/best')}
                    className={selectedFormatId === 'bestvideo+bestaudio/best' ? 'bg-orange-500 hover:bg-orange-600 text-white' : ''}
                >
                    🌟 Best Available (Auto Video + Audio)
                </Button>
                <Button
                    size="sm"
                    variant={selectedFormatId === 'bestvideo[height<=1080]+bestaudio/best' ? 'default' : 'outline'}
                    onClick={() => setSelectedFormatId('bestvideo[height<=1080]+bestaudio/best')}
                    className={selectedFormatId === 'bestvideo[height<=1080]+bestaudio/best' ? 'bg-orange-500 hover:bg-orange-600 text-white' : ''}
                >
                    🎬 1080p Max + Audio
                </Button>
                <Button
                    size="sm"
                    variant={selectedFormatId === 'bestaudio/best' ? 'default' : 'outline'}
                    onClick={() => setSelectedFormatId('bestaudio/best')}
                    className={selectedFormatId === 'bestaudio/best' ? 'bg-orange-500 hover:bg-orange-600 text-white' : ''}
                >
                    🎵 Best Audio Only
                </Button>
                <Button
                    size="sm"
                    variant={selectedFormatId === '18' ? 'default' : 'outline'}
                    onClick={() => setSelectedFormatId('18')}
                    className={selectedFormatId === '18' ? 'bg-orange-500 hover:bg-orange-600 text-white' : ''}
                >
                    📱 360p Single File
                </Button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-border/40">
                <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg">
                    {(['all', 'combined', 'video', 'audio'] as const).map(cat => (
                        <Button
                            key={cat}
                            size="sm"
                            variant={formatCategory === cat ? 'secondary' : 'ghost'}
                            onClick={() => setFormatCategory(cat)}
                            className="capitalize h-7 text-xs"
                        >
                            {cat === 'all' ? `All (${totalFormatsCount})` : cat}
                        </Button>
                    ))}
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
    );
}
