import React from "react";

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

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-border/40">
                <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg">
                    {(['all', 'combined', 'video', 'audio'] as const).map(cat => (
                        <button
                            key={cat}
                            onClick={() => setFormatCategory(cat)}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-all capitalize ${formatCategory === cat ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            {cat === 'all' ? `All (${totalFormatsCount})` : cat}
                        </button>
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
