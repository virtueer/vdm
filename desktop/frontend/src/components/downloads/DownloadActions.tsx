import React from "react";
import { Button } from "@/components/ui/button";
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
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onOpenFormats}
                    className="text-orange-600 dark:text-orange-400 hover:bg-orange-500/10 gap-1 text-xs"
                    title="Inspect & Change YouTube Formats (-F)"
                >
                    <ListFilter className="w-4 h-4" />
                    <span className="hidden sm:inline">Format</span>
                </Button>
            )}

            <Button variant="ghost" size="icon" onClick={() => setExpanded(!expanded)} title="Toggle Chart">
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>

            {item.status === 'completed' && (
                <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => ShowInFolder(item.id)}
                    className="hover:text-blue-500 hover:bg-blue-500/10"
                    title="Show in Folder"
                >
                    <FolderOpen className="w-4 h-4" />
                </Button>
            )}
            
            {(item.status === 'downloading' || item.status === 'pending') && (
                <div className="flex items-center gap-1">
                    <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => {
                            if (onUpdateItemStatus) onUpdateItemStatus(item.id, 'paused', 'Paused');
                            PauseDownload(item.id).catch(console.error);
                        }}
                        className="hover:text-primary hover:bg-primary/10"
                        title="Pause Download"
                    >
                        <Pause className="w-4 h-4 fill-current" />
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => onDelete && onDelete()}
                        className="hover:text-destructive hover:bg-destructive/10"
                        title="Cancel Download"
                    >
                        <XCircle className="w-4 h-4" />
                    </Button>
                </div>
            )}

            {item.status === 'paused' && (
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                            if (onUpdateItemStatus) onUpdateItemStatus(item.id, 'pending', 'Resuming...');
                            ResumeDownload(item.id).catch(console.error);
                        }}
                        className="hover:text-primary hover:bg-primary/10"
                        title="Resume"
                    >
                        <Play className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete && onDelete()}
                        className="hover:text-destructive hover:bg-destructive/10"
                        title="Cancel & Delete File"
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            )}

            {(item.status === 'error' || item.status === 'cancelled') && (
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                            if (onUpdateItemStatus) onUpdateItemStatus(item.id, 'pending', 'Retrying...');
                            RetryDownload(item.id).catch(console.error);
                        }}
                        className="hover:text-primary hover:bg-primary/10"
                        title="Retry"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete && onDelete()}
                        className="hover:text-destructive hover:bg-destructive/10"
                        title="Remove completely"
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            )}

            {item.status === 'completed' && (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete && onDelete()}
                    className="hover:text-destructive hover:bg-destructive/10"
                    title="Remove from list"
                >
                    <Trash2 className="w-4 h-4" />
                </Button>
            )}
        </div>
    );
}
