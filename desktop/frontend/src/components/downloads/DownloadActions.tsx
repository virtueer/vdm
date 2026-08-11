import React from "react";
import { ListFilter, ChevronUp, ChevronDown, FolderOpen, Pause, Play, XCircle, Trash2, RefreshCw } from "lucide-react";
import type { DownloadItem } from "../../types/download";
import { isYouTubeUrl } from "../../utils/formatters";
import { PauseDownload, ResumeDownload, RetryDownload, ShowInFolder } from "../../../bindings/vdm/app";

interface DownloadActionsProps {
    item: DownloadItem;
    expanded: boolean;
    setExpanded: (val: boolean) => void;
    onDelete?: () => void;
    onOpenFormats?: () => void;
    onUpdateItemStatus?: (id: string, status: string, msg: string) => void;
}

export function DownloadActions({
    item,
    expanded,
    setExpanded,
    onDelete,
    onOpenFormats,
    onUpdateItemStatus
}: DownloadActionsProps) {
    const isYouTube = isYouTubeUrl(item.url);

    return (
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
                            if (onUpdateItemStatus) onUpdateItemStatus(item.id, 'paused', 'Paused');
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
    );
}
