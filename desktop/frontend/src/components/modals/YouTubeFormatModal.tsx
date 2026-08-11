import React, { useState } from "react";
import { SlidersHorizontal, XCircle, Loader2, Check } from "lucide-react";
import { SetDownloadFormat, ResumeDownload } from "../../../bindings/vdm/app";
import type { DownloadItem, FormatSortField } from "../../types/download";
import { useYouTubeFormatsFetcher } from "../../hooks/useYouTubeFormatsFetcher";
import { sortFormats } from "../../utils/formatSorter";
import { FormatPresets } from "./FormatPresets";
import { FormatTable } from "./FormatTable";

interface YouTubeFormatModalProps {
    target: { id?: string; url: string; title?: string };
    downloads: DownloadItem[];
    onManualDownload: (formatId?: string) => void;
    onClose: () => void;
}

export function YouTubeFormatModal({ target, downloads, onManualDownload, onClose }: YouTubeFormatModalProps) {
    const { formatLoading, formatError, formatsList } = useYouTubeFormatsFetcher(target.url);
    const [selectedFormatId, setSelectedFormatId] = useState<string | null>(null);
    const [autoAppendAudio, setAutoAppendAudio] = useState(true);
    const [formatCategory, setFormatCategory] = useState<'all' | 'combined' | 'video' | 'audio'>('all');
    const [formatSortField, setFormatSortField] = useState<FormatSortField | null>(null);
    const [formatSortAsc, setFormatSortAsc] = useState<boolean>(true);

    const applySelectedFormat = () => {
        if (!selectedFormatId) return;
        let finalFormat = selectedFormatId;
        const targetFormat = formatsList.find(f => f.formatId === selectedFormatId);
        
        if (targetFormat && targetFormat.vcodec !== 'none' && targetFormat.acodec === 'none' && autoAppendAudio) {
            finalFormat = `${selectedFormatId}+bestaudio`;
        }

        if (target.id) {
            SetDownloadFormat(target.id, finalFormat).then(() => {
                const existing = downloads.find(d => d.id === target.id);
                if (existing && (existing.status === 'paused' || existing.status === 'error' || existing.status === 'cancelled')) {
                    ResumeDownload(target.id).catch(console.error);
                }
            }).catch(console.error);
        } else {
            onManualDownload(finalFormat);
        }
        onClose();
    };

    const handleFormatSort = (field: FormatSortField) => {
        if (formatSortField === field) setFormatSortAsc(!formatSortAsc);
        else { setFormatSortField(field); setFormatSortAsc(true); }
    };

    const sortedFormats = sortFormats(formatsList, formatCategory, formatSortField, formatSortAsc);

    return (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card border shadow-2xl rounded-xl max-w-4xl w-full flex flex-col h-[80vh] overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/30">
                    <div>
                        <h3 className="text-base font-semibold flex items-center gap-2">
                            <SlidersHorizontal className="w-5 h-5 text-orange-500" />
                            YouTube Formats (yt-dlp -F)
                        </h3>
                        <p className="text-xs text-muted-foreground truncate max-w-xl mt-0.5" title={target.title || target.url}>{target.title || target.url}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"><XCircle className="w-5 h-5" /></button>
                </div>

                <FormatPresets 
                    selectedFormatId={selectedFormatId}
                    setSelectedFormatId={setSelectedFormatId}
                    formatCategory={formatCategory}
                    setFormatCategory={setFormatCategory}
                    autoAppendAudio={autoAppendAudio}
                    setAutoAppendAudio={setAutoAppendAudio}
                    totalFormatsCount={formatsList.length}
                />

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
                    ) : sortedFormats.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No formats matching current filter.</div>
                    ) : (
                        <FormatTable 
                            formats={sortedFormats}
                            selectedFormatId={selectedFormatId}
                            setSelectedFormatId={setSelectedFormatId}
                            autoAppendAudio={autoAppendAudio}
                            formatSortField={formatSortField}
                            formatSortAsc={formatSortAsc}
                            onSort={handleFormatSort}
                        />
                    )}
                </div>

                <div className="flex items-center justify-between px-6 py-4 border-t bg-card">
                    <div className="text-xs text-muted-foreground">
                        {selectedFormatId ? (
                            <span>
                                Selected Format: <strong className="text-orange-500 font-mono">{selectedFormatId}</strong>
                                {autoAppendAudio && formatsList.find(f => f.formatId === selectedFormatId)?.vcodec !== 'none' && formatsList.find(f => f.formatId === selectedFormatId)?.acodec === 'none' && (
                                    <span className="text-blue-500 font-medium"> (+bestaudio auto-merged into MP4)</span>
                                )}
                            </span>
                        ) : (<span>Click on a format row or preset above to select</span>)}
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-4 py-2 rounded-md hover:bg-muted text-xs font-medium transition-colors">Cancel</button>
                        <button onClick={applySelectedFormat} disabled={!selectedFormatId} className="px-4 py-2 rounded-md bg-orange-600 text-white hover:bg-orange-500 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5">
                            <Check className="w-4 h-4" />
                            Start Download
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
