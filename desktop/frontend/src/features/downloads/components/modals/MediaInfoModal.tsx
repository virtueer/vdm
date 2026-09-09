import {
  Check,
  Clock,
  Copy,
  Film,
  FolderOpen,
  HardDrive,
  Info,
  Loader2,
  Maximize2,
  Video,
  Volume2,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { api } from '@/features/downloads/api';
import type { DownloadItem, MediaInfo } from '@/features/downloads/types';
import { cn } from '@/lib/utils';

interface MediaInfoModalProps {
  item: DownloadItem | null;
  isOpen: boolean;
  onClose: () => void;
  onShowInFolder?: (id: string) => void;
}

const labelClass = 'text-[11px] uppercase tracking-wide text-muted-foreground/80';

interface TileProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

const Tile = ({ icon, label, value }: TileProps) => (
  <div className="flex min-w-0 items-center gap-2.5 rounded-md border border-border/60 bg-muted/30 p-2.5">
    <span className="shrink-0">{icon}</span>
    <div className="flex min-w-0 flex-col">
      <span className={labelClass}>{label}</span>
      <span className="truncate font-mono text-[11px] tracking-tight" title={value}>
        {value}
      </span>
    </div>
  </div>
);

const Field = ({ label, value, wide }: { label: string; value: string; wide?: boolean }) => (
  <div className={cn('flex min-w-0 flex-col', wide && 'col-span-3')}>
    <span className={labelClass}>{label}</span>
    <span className="truncate font-mono text-[11px] tracking-tight" title={value}>
      {value}
    </span>
  </div>
);

const filePathBox = cn(
  'select-text break-all rounded-md border border-border/60 bg-background p-2.5',
  'font-mono text-[11px] leading-relaxed text-muted-foreground'
);

const streamSection = 'flex flex-col gap-2.5 rounded-lg border border-border/60 bg-muted/20 p-3';

export const MediaInfoModal: React.FC<MediaInfoModalProps> = ({
  item,
  isOpen,
  onClose,
  onShowInFolder,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const [copied, setCopied] = useState(false);

  // ffprobe accepts the destination path, or the id when the path is unknown.
  const target = item ? item.destination || item.id : null;

  const fetchInfo = useCallback(async () => {
    if (!target) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getMediaInfo(target);
      if (data) {
        setInfo(data);
      } else {
        setError('Medya analiz bilgileri alınamadı.');
      }
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : '';
      setError(message || 'Medya analizi sırasında hata oluştu.');
    } finally {
      setLoading(false);
    }
  }, [target]);

  // Keyed on the target, so live list updates never retrigger the analysis.
  useEffect(() => {
    if (isOpen && target) {
      fetchInfo();
    } else {
      setInfo(null);
      setError(null);
    }
  }, [isOpen, target, fetchInfo]);

  const handleCopyPath = () => {
    if (!info?.filePath) return;
    navigator.clipboard.writeText(info.filePath);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const primaryVideo = info?.videoStreams?.[0] ?? null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-[620px]">
        <DialogHeader>
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-muted">
            <Film className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <DialogTitle>{info?.fileName || item?.title || 'Medya Analizi'}</DialogTitle>
            <DialogDescription>Video ve ses akışı analizi · ffprobe</DialogDescription>
          </div>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground/70">
              <Loader2 className="h-4 w-4 animate-spin" />
              <p className="text-xs">Video analiz ediliyor…</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <div className="grid h-8 w-8 place-items-center rounded-md bg-destructive/10">
                <Info className="h-4 w-4 text-destructive" />
              </div>
              <p className="text-xs font-medium">Analiz başarısız</p>
              <p className="max-w-[320px] text-[11px] text-muted-foreground/70">{error}</p>
              <Button variant="outline" size="sm" onClick={fetchInfo} className="mt-1">
                Tekrar Dene
              </Button>
            </div>
          ) : info ? (
            <div className="flex flex-col gap-2.5 p-3.5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Tile
                  icon={<Maximize2 className="h-3.5 w-3.5 text-info" />}
                  label="Çözünürlük"
                  value={primaryVideo ? `${primaryVideo.width}x${primaryVideo.height}` : '—'}
                />
                <Tile
                  icon={<Clock className="h-3.5 w-3.5 text-success" />}
                  label="Süre"
                  value={info.duration || '—'}
                />
                <Tile
                  icon={<Zap className="h-3.5 w-3.5 text-warning" />}
                  label="Bitrate"
                  value={info.overallBitrate || primaryVideo?.bitrate || '—'}
                />
                <Tile
                  icon={<HardDrive className="h-3.5 w-3.5 text-muted-foreground" />}
                  label="Boyut"
                  value={info.fileSize || '—'}
                />
              </div>

              {info.videoStreams.map((v) => (
                <div key={`video-${v.index}`} className={streamSection}>
                  <div className="flex items-center gap-2">
                    <Video className="h-3.5 w-3.5 text-info" />
                    <span className="text-xs font-medium">Video akışı #{v.index}</span>
                    <div className="ml-auto flex items-center gap-1">
                      <Badge variant="info">{v.codecName}</Badge>
                      {v.fps && <Badge variant="outline">{v.fps}</Badge>}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5 border-t border-border/60 pt-2.5">
                    <Field label="Çözünürlük" value={v.resolution || `${v.width}x${v.height}`} />
                    <Field label="En-boy" value={v.aspectRatio || '—'} />
                    <Field label="Bitrate" value={v.bitrate || 'VBR'} />
                    <Field label="Codec" value={v.codecLong || v.codecName} wide />
                  </div>
                </div>
              ))}

              {info.audioStreams.map((a) => (
                <div key={`audio-${a.index}`} className={streamSection}>
                  <div className="flex items-center gap-2">
                    <Volume2 className="h-3.5 w-3.5 text-success" />
                    <span className="text-xs font-medium">
                      Ses akışı #{a.index}
                      {a.language ? ` · ${a.language}` : ''}
                    </span>
                    <div className="ml-auto flex items-center gap-1">
                      <Badge variant="success">{a.codecName}</Badge>
                      {a.channelLayout && <Badge variant="outline">{a.channelLayout}</Badge>}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5 border-t border-border/60 pt-2.5">
                    <Field label="Örnekleme" value={a.sampleRate || '—'} />
                    <Field label="Bitrate" value={a.bitrate || '—'} />
                    <Field label="Kanal" value={a.channels ? `${a.channels}` : '—'} />
                    <Field label="Codec" value={a.codecLong || a.codecName} wide />
                  </div>
                </div>
              ))}

              <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/30 p-3">
                <div className="flex items-center gap-2">
                  <HardDrive className="h-3 w-3 text-muted-foreground/70" />
                  <span className={labelClass}>Dosya yolu</span>
                  <Button variant="ghost" size="sm" onClick={handleCopyPath} className="ml-auto">
                    {copied ? <Check className="text-success" /> : <Copy />}
                    <span>{copied ? 'Kopyalandı' : 'Kopyala'}</span>
                  </Button>
                </div>
                <p className={filePathBox}>{info.filePath}</p>
                <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                  <span>Kapsayıcı:</span>
                  <span className="text-foreground/80">{info.formatName}</span>
                </div>
              </div>
            </div>
          ) : null}
        </ScrollArea>

        <DialogFooter className="justify-between">
          {item && onShowInFolder ? (
            <Button variant="outline" onClick={() => onShowInFolder(item.id)}>
              <FolderOpen />
              <span>Klasörde Göster</span>
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={onClose}>Kapat</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
