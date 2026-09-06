import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  FolderOpen,
  Gauge,
  HardDrive,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  Video,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import type { DownloadItem } from '@/types';

interface DownloadCardProps {
  item: DownloadItem;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onShowInFolder: (id: string) => void;
  onDeleteRequest: (item: DownloadItem) => void;
}

export const DownloadCard: React.FC<DownloadCardProps> = ({
  item,
  onPause,
  onResume,
  onShowInFolder,
  onDeleteRequest,
}) => {
  const [elapsed, setElapsed] = useState<number>(item.elapsedSecs || 0);

  useEffect(() => {
    setElapsed(item.elapsedSecs || 0);
  }, [item.elapsedSecs]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (item.status === 'downloading' && item.startedAt > 0) {
      interval = setInterval(() => {
        const liveSecs =
          (item.elapsedSecs || 0) +
          Math.floor((Date.now() - item.startedAt) / 1000);
        setElapsed(liveSecs);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [item.status, item.startedAt, item.elapsedSecs]);

  const formatDuration = (seconds: number) => {
    if (seconds < 0) seconds = 0;
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusBadge = () => {
    switch (item.status) {
      case 'downloading':
        return (
          <Badge variant="info" className="gap-1 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            İndiriliyor
          </Badge>
        );
      case 'paused':
        return (
          <Badge variant="warning" className="gap-1">
            <Pause className="w-3 h-3" />
            Duraklatıldı
          </Badge>
        );
      case 'completed':
        return (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Tamamlandı
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive" className="gap-1">
            Hata
          </Badge>
        );
      default:
        return <Badge variant="secondary">Bekleniyor</Badge>;
    }
  };

  const isDownloading = item.status === 'downloading';
  const isPaused = item.status === 'paused';
  const isCompleted = item.status === 'completed';
  const isError = item.status === 'error';

  const progressPercent = Math.min(Math.max(item.progress || 0, 0), 100);

  return (
    <Card className="overflow-hidden border border-border/70 hover:border-border transition-all duration-200 shadow-sm hover:shadow-md bg-card">
      <CardContent className="p-4 flex flex-col gap-3">
        {/* Top Header Row: Title, URL, Status Badge */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted border border-border/80 text-muted-foreground shrink-0 mt-0.5">
              <Video className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h4
                className="text-sm font-semibold text-foreground truncate"
                title={item.title || item.url}
              >
                {item.title || 'İsimsiz Video'}
              </h4>
              <p
                className="text-xs text-muted-foreground truncate max-w-lg mt-0.5 flex items-center gap-1 opacity-80 hover:opacity-100"
                title={item.url}
              >
                <span className="truncate">{item.url}</span>
              </p>
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            {getStatusBadge()}
          </div>
        </div>

        {/* Progress Bar & Percent Info */}
        <div className="flex flex-col gap-1.5 mt-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {progressPercent.toFixed(1)}%
            </span>
            <span className="flex items-center gap-1 font-mono">
              <HardDrive className="w-3.5 h-3.5 opacity-60" />
              {item.downloadedSize || '0 B'}{' '}
              {item.totalSize ? `/ ${item.totalSize}` : ''}
            </span>
          </div>
          <Progress
            value={progressPercent}
            className={
              isCompleted
                ? '[&>div]:bg-emerald-500'
                : isPaused
                  ? '[&>div]:bg-amber-500'
                  : isError
                    ? '[&>div]:bg-red-500'
                    : '[&>div]:bg-primary'
            }
          />
        </div>

        {/* Bottom Details & Action Buttons */}
        <div className="flex items-center justify-between pt-1 text-xs border-t border-border/50">
          {/* Metadata: Speed & Elapsed Time */}
          <div className="flex items-center gap-4 text-muted-foreground font-mono">
            <div className="flex items-center gap-1.5" title="İndirme Hızı">
              <Gauge className="w-3.5 h-3.5 text-blue-500" />
              <span>{isDownloading ? item.speed || 'Hesaplanıyor...' : '0 B/s'}</span>
            </div>
            <div className="flex items-center gap-1.5" title="Geçen Süre">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <span>{formatDuration(elapsed)}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5">
            {isDownloading && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 text-xs font-medium hover:bg-amber-500/10 hover:text-amber-500 hover:border-amber-500/30"
                onClick={() => onPause(item.id)}
                title="İndirmeyi Duraklat"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>Duraklat</span>
              </Button>
            )}

            {isPaused && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 text-xs font-medium hover:bg-blue-500/10 hover:text-blue-500 hover:border-blue-500/30"
                onClick={() => onResume(item.id)}
                title="İndirmeye Devam Et"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Devam Et</span>
              </Button>
            )}

            {isError && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 text-xs font-medium hover:bg-blue-500/10 hover:text-blue-500"
                onClick={() => onResume(item.id)}
                title="Tekrar Dene"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Tekrar Dene</span>
              </Button>
            )}

            {isCompleted && (
              <Button
                variant="secondary"
                size="sm"
                className="h-8 gap-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 text-foreground"
                onClick={() => onShowInFolder(item.id)}
                title="Dosyayı sistem dosya yöneticisinde göster"
              >
                <FolderOpen className="w-3.5 h-3.5 text-emerald-500" />
                <span>Klasörde Göster</span>
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              onClick={() => onDeleteRequest(item)}
              title="İndirmeyi Sil"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
