import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  FolderOpen,
  RotateCcw,
  Terminal,
  X,
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
import { ScrollArea } from '@/components/ui/scroll-area';
import type { DownloadItem } from '@/types';

interface ErrorModalProps {
  item: DownloadItem | null;
  isOpen: boolean;
  onClose: () => void;
  onRetry?: (id: string) => void;
  onShowInFolder?: (id: string) => void;
}

export const ErrorModal: React.FC<ErrorModalProps> = ({
  item,
  isOpen,
  onClose,
  onRetry,
  onShowInFolder,
}) => {
  const [copied, setCopied] = useState(false);

  if (!item) return null;

  const errorContent =
    item.errorDetails ||
    item.statusMsg ||
    'Bilinmeyen bir indirme hatası oluştu.';

  const handleCopyLogs = () => {
    const fullLog = `[VDM Error Report]
ID: ${item.id}
Title: ${item.title}
URL: ${item.url}
Destination: ${item.destination}
Status: ${item.status}
Status Message: ${item.statusMsg}
Progress: ${item.progress}%
Downloaded: ${item.downloadedSize} / ${item.totalSize}
Timestamp: ${new Date(item.createdAt).toLocaleString()}

--- Error Details & Trace ---
${errorContent}
`;
    navigator.clipboard.writeText(fullLog);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRetry = () => {
    if (onRetry) {
      onRetry(item.id);
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[620px] max-w-[calc(100vw-2rem)] flex flex-col p-0 gap-0 overflow-hidden bg-background/95 backdrop-blur-md border shadow-2xl">
        <DialogHeader className="p-5 pb-3 border-b bg-destructive/5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-destructive/15 flex items-center justify-center text-destructive shrink-0 shadow-inner">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-base font-semibold text-foreground leading-tight">
                    İndirme Hatası
                  </DialogTitle>
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                    HATA
                  </Badge>
                </div>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5 line-clamp-1 break-all">
                  {item.title || item.url}
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="p-5 flex flex-col gap-3.5">
          {/* Item Meta info */}
          <div className="grid grid-cols-2 gap-2 text-xs bg-muted/40 p-3 rounded-lg border border-border/70">
            <div>
              <span className="text-[11px] text-muted-foreground block">Hedef Dosya</span>
              <p className="font-mono text-[11px] text-foreground truncate select-all" title={item.destination}>
                {item.destination || 'Belirtilmedi'}
              </p>
            </div>
            <div>
              <span className="text-[11px] text-muted-foreground block">İndirme İlerlemesi</span>
              <p className="font-semibold text-foreground">
                %{item.progress.toFixed(1)} ({item.downloadedSize || '0 B'})
              </p>
            </div>
          </div>

          {/* Error Log Terminal Box */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Hata Detayı & Sistem Logu</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyLogs}
                className="h-7 px-2 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-500" />
                    <span className="text-emerald-500">Kopyalandı</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Logları Kopyala</span>
                  </>
                )}
              </Button>
            </div>

            <div className="relative rounded-lg bg-black/90 dark:bg-black/95 text-zinc-200 border border-zinc-800 p-3.5 font-mono text-xs overflow-hidden">
              <ScrollArea className="max-h-[220px] pr-2">
                <div className="text-red-400 font-semibold mb-1 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                  <span>{item.statusMsg || 'Error occurred'}</span>
                </div>
                <pre className="whitespace-pre-wrap break-all text-[11px] text-zinc-300 leading-relaxed font-mono">
                  {errorContent}
                </pre>
              </ScrollArea>
            </div>
          </div>
        </div>

        <DialogFooter className="p-4 pt-2 border-t bg-muted/20 gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={onClose}>
            Kapat
          </Button>
          {onShowInFolder && item.destination && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onShowInFolder(item.id)}
              className="gap-1.5"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Klasörde Göster</span>
            </Button>
          )}
          {onRetry && (
            <Button
              variant="default"
              size="sm"
              onClick={handleRetry}
              className="gap-1.5 bg-primary shadow-sm"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Yeniden Dene</span>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
