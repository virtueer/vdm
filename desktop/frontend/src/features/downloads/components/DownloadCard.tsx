import {
  AlertTriangle,
  ArrowDown,
  Check,
  Copy,
  FolderOpen,
  Info,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  Video,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { statusMeta } from '@/features/downloads/status';
import type { DownloadItem } from '@/features/downloads/types';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';

interface DownloadCardProps {
  item: DownloadItem;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onShowInFolder: (id: string) => void;
  onShowMediaInfo: (item: DownloadItem) => void;
  onShowError?: (item: DownloadItem) => void;
  onDeleteRequest: (item: DownloadItem) => void;
}

const iconBox = cn(
  'mt-px grid h-8 w-8 shrink-0 place-items-center',
  'rounded-md border border-border/60 bg-muted/40'
);

const metaRow =
  'flex items-center gap-2.5 font-mono text-[11px] tracking-tight text-muted-foreground';

export const DownloadCard = React.memo<DownloadCardProps>(
  ({ item, onPause, onResume, onShowInFolder, onShowMediaInfo, onShowError, onDeleteRequest }) => {
    const [elapsed, setElapsed] = useState<number>(item.elapsedSecs || 0);
    const [copied, setCopied] = useState<boolean>(false);

    useEffect(() => {
      setElapsed(item.elapsedSecs || 0);
    }, [item.elapsedSecs]);

    useEffect(() => {
      if (item.status !== 'downloading' || item.startedAt <= 0) return;
      const interval = setInterval(() => {
        const live = (item.elapsedSecs || 0) + Math.floor((Date.now() - item.startedAt) / 1000);
        setElapsed(live);
      }, 1000);
      return () => clearInterval(interval);
    }, [item.status, item.startedAt, item.elapsedSecs]);

    const handleCopyUrl = async () => {
      if (!item.url) return;
      try {
        await navigator.clipboard.writeText(item.url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      } catch (err) {
        console.error('Failed to copy URL:', err);
      }
    };

    const isDownloading = item.status === 'downloading';
    const isQueued = item.status === 'queued' || item.status === 'pending';
    const meta = statusMeta(item.status);
    const percent = Math.min(Math.max(item.progress || 0, 0), 100);

    return (
      <Card className="p-3.5 transition-colors duration-100 ease-out hover:border-border hover:bg-accent/20">
        <div className="flex items-start gap-3">
          <div className={iconBox}>
            <Video className="h-4 w-4 text-muted-foreground" />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {/* Title, status, actions */}
            <div className="flex items-center gap-2">
              <h4
                className="min-w-0 flex-1 truncate text-[13px] font-medium"
                title={item.title || item.url}
              >
                {item.title || 'İsimsiz Video'}
              </h4>

              <Badge
                variant={meta.badge}
                className={cn(item.status === 'error' && 'cursor-pointer hover:bg-danger/20')}
                onClick={item.status === 'error' ? () => onShowError?.(item) : undefined}
                title={item.statusMsg || meta.label}
              >
                {isDownloading && <span className="h-1.5 w-1.5 rounded-full bg-info" />}
                {meta.label}
              </Badge>

              <div className="flex shrink-0 items-center gap-1">
                {isDownloading && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onPause(item.id)}
                    title="Duraklat"
                  >
                    <Pause />
                  </Button>
                )}

                {item.status === 'paused' && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onResume(item.id)}
                    title="Devam et"
                  >
                    <Play />
                  </Button>
                )}

                {isQueued && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onResume(item.id)}
                      title="Şimdi indir"
                    >
                      <Play />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onPause(item.id)}
                      title="Kuyruktan çıkar"
                    >
                      <Pause />
                    </Button>
                  </>
                )}

                {item.status === 'error' && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-danger/80 hover:bg-danger/10 hover:text-danger"
                      onClick={() => onShowError?.(item)}
                      title="Hata detayı ve log"
                    >
                      <AlertTriangle />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onResume(item.id)}
                      title="Tekrar dene"
                    >
                      <RotateCcw />
                    </Button>
                  </>
                )}

                {item.status === 'completed' && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onResume(item.id)}
                      title="Tekrar indir"
                    >
                      <RotateCcw />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onShowMediaInfo(item)}
                      title="Medya analizi"
                    >
                      <Info />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onShowInFolder(item.id)}
                      title="Klasörde göster"
                    >
                      <FolderOpen />
                    </Button>
                  </>
                )}

                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => onDeleteRequest(item)}
                  title="Sil"
                >
                  <Trash2 />
                </Button>
              </div>
            </div>

            {/* Source URL, click to copy */}
            <button
              type="button"
              onClick={handleCopyUrl}
              title="Bağlantıyı kopyala"
              className={cn(
                '-mx-1.5 flex w-fit max-w-full items-center gap-2 rounded-sm px-1.5 py-1 text-left',
                'transition-colors duration-100 ease-out hover:bg-accent/40 hover:text-foreground',
                copied ? 'text-success' : 'text-muted-foreground/70'
              )}
            >
              {copied ? (
                <Check className="h-3 w-3 shrink-0" />
              ) : (
                <Copy className="h-3 w-3 shrink-0 opacity-60" />
              )}
              <span className="truncate font-mono text-[11px] tracking-tight">{item.url}</span>
            </button>

            {/* Progress and technical metrics */}
            <div className="flex flex-col gap-1.5 pt-0.5">
              <Progress value={percent} className={meta.bar} />
              <div className={metaRow}>
                <span className="text-foreground/80">{percent.toFixed(1)}%</span>
                <span>
                  {item.downloadedSize || '0 B'}
                  {item.totalSize ? ` / ${item.totalSize}` : ''}
                </span>
                {(isQueued || isDownloading) && item.statusMsg && (
                  <span className="truncate">{item.statusMsg}</span>
                )}

                <span className="ml-auto flex shrink-0 items-center gap-3">
                  {isDownloading && (
                    <span className="flex items-center gap-1.5 text-info">
                      <ArrowDown className="h-3 w-3" />
                      {item.speed || 'hesaplanıyor'}
                    </span>
                  )}
                  <span>{formatDuration(elapsed)}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>
    );
  },
  (prev, next) => {
    return (
      prev.item.id === next.item.id &&
      prev.item.status === next.item.status &&
      prev.item.progress === next.item.progress &&
      prev.item.speed === next.item.speed &&
      prev.item.downloadedSize === next.item.downloadedSize &&
      prev.item.totalSize === next.item.totalSize &&
      prev.item.statusMsg === next.item.statusMsg &&
      prev.item.elapsedSecs === next.item.elapsedSecs &&
      prev.item.title === next.item.title &&
      prev.item.url === next.item.url
    );
  }
);

DownloadCard.displayName = 'DownloadCard';
