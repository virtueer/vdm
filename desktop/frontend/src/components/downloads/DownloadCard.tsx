import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { FileVideo, Terminal } from "lucide-react";
import type { DownloadItem, ProbeInfo } from "../../types/download";
import { getFilenameFromUrl } from "../../utils/formatters";
import { SpeedChart } from "../SpeedChart";
import { ProbeStatus } from "./ProbeStatus";
import { DownloadActions } from "./DownloadActions";

interface DownloadCardProps {
    item: DownloadItem;
    logCount?: number;
    probeInfo?: ProbeInfo;
    onViewLogs?: () => void;
    onDelete?: () => void;
    onOpenFormats?: () => void;
    onUpdateItemStatus?: (id: string, status: string, msg: string) => void;
}

export function DownloadCard({
    item,
    logCount = 0,
    probeInfo,
    onViewLogs,
    onDelete,
    onOpenFormats,
    onUpdateItemStatus
}: DownloadCardProps) {
    const filename = getFilenameFromUrl(item.url);
    const [expanded, setExpanded] = useState(false);
    const [stats, setStats] = useState({ avgSpeed: '', duration: '' });
    
    let badgeVariant: "default" | "secondary" | "destructive" | "outline" = "secondary";
    let statusText = item.status;
    let progress = item.progress || 0;
    
    if (item.status === 'pending') statusText = 'Pending';
    else if (item.status === 'downloading') { statusText = 'Downloading'; badgeVariant = 'default'; }
    else if (item.status === 'paused') { statusText = 'Paused'; badgeVariant = 'outline'; }
    else if (item.status === 'completed') { statusText = 'Completed'; badgeVariant = 'outline'; progress = 100; }
    else if (item.status === 'error') { statusText = 'Error'; badgeVariant = 'destructive'; }
    else if (item.status === 'cancelled') statusText = 'Cancelled';

    const showProgressInfo = item.status === 'downloading' || item.status === 'completed' || item.status === 'paused';

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
                            <div className="flex items-center gap-1.5">
                                {item.formatId && (
                                    <Badge variant="outline" className="text-[10px] shrink-0 border-orange-500/50 text-orange-600 dark:text-orange-400 font-mono">
                                        -f {item.formatId}
                                    </Badge>
                                )}
                                <Badge variant={badgeVariant} className="text-[10px] shrink-0">{statusText}</Badge>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{item.type.toUpperCase()}</Badge>
                            <span className="text-xs text-muted-foreground">{item.totalSize || item.size}</span>
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
                        {item.statusMsg && (
                            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground/80 font-mono italic">
                                {item.status === 'downloading' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse shrink-0"></span>}
                                <span className="truncate">{item.statusMsg}</span>
                            </div>
                        )}
                    </div>

                    <DownloadActions 
                        item={item}
                        expanded={expanded}
                        setExpanded={setExpanded}
                        onDelete={onDelete}
                        onOpenFormats={onOpenFormats}
                        onUpdateItemStatus={onUpdateItemStatus}
                    />
                </div>

                <ProbeStatus probeInfo={probeInfo} />

                {(showProgressInfo || item.status === 'error' || item.status === 'cancelled') && (
                    <div className="flex items-center gap-3">
                        <Progress value={progress} className={`h-1.5 flex-1 ${item.status === 'error' ? 'opacity-50' : ''}`} />
                        <span className="text-xs text-muted-foreground w-12 text-right font-mono">{progress.toFixed(1)}%</span>
                    </div>
                )}
            </CardContent>

            {(expanded || item.status === 'downloading') && (
                <div className={expanded ? "h-[200px] border-t bg-muted/10" : "hidden"}>
                    <SpeedChart 
                        speedStr={item.speed} 
                        downloadedSize={item.downloadedSize}
                        totalSize={item.totalSize || item.size}
                        progress={progress}
                        isDownloading={item.status === 'downloading'} 
                        onStatsUpdate={(avg, dur) => setStats({ avgSpeed: avg, duration: dur })} 
                    />
                </div>
            )}
        </Card>
    );
}
