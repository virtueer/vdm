import React, { useEffect, useState } from 'react';
import {
  Activity,
  AudioLines,
  Check,
  Clock,
  Copy,
  Film,
  FolderOpen,
  HardDrive,
  Info,
  Layers,
  Loader2,
  Maximize2,
  Music,
  Video,
  Volume2,
  Zap,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { api } from '@/lib/api';
import type { DownloadItem, MediaInfo } from '@/types';

interface MediaInfoModalProps {
  item: DownloadItem | null;
  isOpen: boolean;
  onClose: () => void;
  onShowInFolder?: (id: string) => void;
}

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

  useEffect(() => {
    if (isOpen && item) {
      fetchInfo();
    } else {
      setInfo(null);
      setError(null);
    }
  }, [isOpen, item]);

  const fetchInfo = async () => {
    if (!item) return;
    setLoading(true);
    setError(null);
    try {
      // Pass ID or destination path
      const target = item.destination || item.id;
      const data = await api.getMediaInfo(target);
      if (data) {
        setInfo(data);
      } else {
        setError('Medya analiz bilgileri alınamadı.');
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Medya analizi sırasında hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPath = () => {
    if (info?.filePath) {
      navigator.clipboard.writeText(info.filePath);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const primaryVideo = info?.videoStreams && info.videoStreams.length > 0 ? info.videoStreams[0] : null;
  const primaryAudio = info?.audioStreams && info.audioStreams.length > 0 ? info.audioStreams[0] : null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-background/95 backdrop-blur-md border shadow-2xl">
        <DialogHeader className="p-5 pb-3 border-b bg-muted/20">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
                <Film className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold leading-tight line-clamp-1">
                  {info?.fileName || item?.title || 'Medya Analizi'}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                  <span>Detaylı Video ve Ses Akışı Analizi (ffprobe)</span>
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 p-5 max-h-[calc(90vh-140px)]">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm font-medium animate-pulse">Video analiz ediliyor, lütfen bekleyin...</p>
            </div>
          ) : error ? (
            <div className="py-12 px-4 text-center">
              <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-3">
                <Info className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-semibold text-foreground mb-1">Analiz Başarısız</h4>
              <p className="text-xs text-muted-foreground mb-4 max-w-sm mx-auto">{error}</p>
              <Button size="sm" variant="outline" onClick={fetchInfo}>
                Tekrar Dene
              </Button>
            </div>
          ) : info ? (
            <div className="space-y-4">
              {/* Quick Summary Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <Card className="bg-card/50 border shadow-xs">
                  <CardContent className="p-3 flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                      <Maximize2 className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase font-medium">Çözünürlük</p>
                      <p className="text-xs font-semibold truncate text-foreground">
                        {primaryVideo ? `${primaryVideo.width}x${primaryVideo.height}` : 'Bilinmiyor'}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-card/50 border shadow-xs">
                  <CardContent className="p-3 flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase font-medium">Süre</p>
                      <p className="text-xs font-semibold truncate text-foreground">
                        {info.duration || 'Bilinmiyor'}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-card/50 border shadow-xs">
                  <CardContent className="p-3 flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                      <Zap className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase font-medium">Bitrate</p>
                      <p className="text-xs font-semibold truncate text-foreground">
                        {info.overallBitrate || (primaryVideo?.bitrate) || 'Bilinmiyor'}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-card/50 border shadow-xs">
                  <CardContent className="p-3 flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
                      <HardDrive className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase font-medium">Boyut</p>
                      <p className="text-xs font-semibold truncate text-foreground">
                        {info.fileSize || 'Bilinmiyor'}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Video Stream Info */}
              {info.videoStreams.map((v, idx) => (
                <div key={idx} className="rounded-xl border bg-card/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Video className="w-4 h-4 text-blue-500" />
                      <span className="text-xs font-semibold text-foreground">
                        Video Akışı #{v.index}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[11px] font-mono uppercase bg-blue-500/5 text-blue-600 dark:text-blue-400 border-blue-500/20">
                        {v.codecName}
                      </Badge>
                      {v.fps && (
                        <Badge variant="outline" className="text-[11px] text-muted-foreground">
                          {v.fps}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-2.5 gap-x-4 text-xs pt-1 border-t border-border/50">
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Çözünürlük:</span>
                      <span className="font-medium text-foreground">{v.resolution || `${v.width}x${v.height}`}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">En-Boy Oranı:</span>
                      <span className="font-medium text-foreground">{v.aspectRatio || '16:9 (Otomatik)'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Video Bitrate:</span>
                      <span className="font-medium text-foreground">{v.bitrate || 'Değişken (VBR)'}</span>
                    </div>
                    <div className="col-span-2 sm:col-span-3">
                      <span className="text-muted-foreground block text-[11px]">Codec Detayı:</span>
                      <span className="font-medium text-foreground text-[11px] font-mono leading-tight truncate block">
                        {v.codecLong || v.codecName}
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              {/* Audio Stream Info */}
              {info.audioStreams.map((a, idx) => (
                <div key={idx} className="rounded-xl border bg-card/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Volume2 className="w-4 h-4 text-emerald-500" />
                      <span className="text-xs font-semibold text-foreground">
                        Ses Akışı #{a.index} {a.language ? `(${a.language})` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[11px] font-mono uppercase bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                        {a.codecName}
                      </Badge>
                      {a.channelLayout && (
                        <Badge variant="outline" className="text-[11px] text-muted-foreground capitalize">
                          {a.channelLayout} ({a.channels} Kanal)
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-2.5 gap-x-4 text-xs pt-1 border-t border-border/50">
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Örnekleme Hızı:</span>
                      <span className="font-medium text-foreground">{a.sampleRate || '44.1 kHz'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Ses Bitrate:</span>
                      <span className="font-medium text-foreground">{a.bitrate || '192 kbps (CBR)'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Kanal Sayısı:</span>
                      <span className="font-medium text-foreground">{a.channels} Kanal</span>
                    </div>
                    <div className="col-span-2 sm:col-span-3">
                      <span className="text-muted-foreground block text-[11px]">Codec Detayı:</span>
                      <span className="font-medium text-foreground text-[11px] font-mono leading-tight truncate block">
                        {a.codecLong || a.codecName}
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              {/* File details & container */}
              <div className="rounded-xl border bg-muted/20 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-[11px] font-semibold text-foreground">Dosya Yolu</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                    onClick={handleCopyPath}
                  >
                    {copied ? <Check className="w-3 h-3 mr-1 text-green-500" /> : <Copy className="w-3 h-3 mr-1" />}
                    {copied ? 'Kopyalandı' : 'Yolu Kopyala'}
                  </Button>
                </div>
                <p className="text-[11px] font-mono text-muted-foreground break-all bg-background/50 p-2 rounded-md border">
                  {info.filePath}
                </p>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-1">
                  <span>Kapsayıcı Formatı:</span>
                  <span className="font-medium text-foreground">{info.formatName}</span>
                </div>
              </div>
            </div>
          ) : null}
        </ScrollArea>

        <DialogFooter className="p-4 border-t bg-muted/20 flex sm:justify-between items-center gap-2">
          {item && onShowInFolder ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => {
                onShowInFolder(item.id);
              }}
            >
              <FolderOpen className="w-3.5 h-3.5 text-muted-foreground" />
              Klasörde Göster
            </Button>
          ) : (
            <div />
          )}

          <Button variant="default" size="sm" onClick={onClose} className="px-5 text-xs">
            Kapat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
