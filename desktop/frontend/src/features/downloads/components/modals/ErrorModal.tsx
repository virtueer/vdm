import { AlertTriangle, Check, Copy, FolderOpen, RotateCcw, Terminal } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
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
import type { DownloadItem } from '@/features/downloads/types';
import { cn } from '@/lib/utils';

interface ErrorModalProps {
  item: DownloadItem | null;
  isOpen: boolean;
  onClose: () => void;
  onRetry?: (id: string) => void;
  onShowInFolder?: (id: string) => void;
}

const sectionLabel = cn(
  'flex items-center gap-1.5 text-[11px] uppercase tracking-wide',
  'text-muted-foreground'
);

const logText = cn(
  'select-text whitespace-pre-wrap break-all font-mono',
  'text-[11px] leading-relaxed text-muted-foreground'
);

const Meta = ({ label, value }: { label: string; value: string }) => (
  <div className="flex min-w-0 flex-col gap-1 rounded-md border border-border/60 bg-muted/30 p-2.5">
    <span className="text-[11px] uppercase tracking-wide text-muted-foreground/80">{label}</span>
    <span className="select-text truncate font-mono text-[11px] tracking-tight" title={value}>
      {value}
    </span>
  </div>
);

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
    item.errorDetails || item.statusMsg || 'Bilinmeyen bir indirme hatası oluştu.';

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
    setTimeout(() => setCopied(false), 1600);
  };

  const handleRetry = () => {
    onRetry?.(item.id);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[580px]">
        <DialogHeader>
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-destructive/10">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
          </div>
          <div className="min-w-0">
            <DialogTitle>İndirme Hatası</DialogTitle>
            <DialogDescription>{item.title || item.url}</DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-3 p-3.5">
          <div className="grid grid-cols-2 gap-2">
            <Meta label="Hedef" value={item.destination || 'Belirtilmedi'} />
            <Meta
              label="İlerleme"
              value={`%${item.progress.toFixed(1)} · ${item.downloadedSize || '0 B'}`}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className={sectionLabel}>
                <Terminal className="h-3 w-3" />
                <span>Sistem logu</span>
              </span>
              <Button variant="ghost" size="sm" onClick={handleCopyLogs}>
                {copied ? <Check className="text-success" /> : <Copy />}
                <span>{copied ? 'Kopyalandı' : 'Logu kopyala'}</span>
              </Button>
            </div>

            <div className="rounded-md border border-border/60 bg-background p-3">
              <ScrollArea className="max-h-[200px]">
                <div className="mb-1 flex items-center gap-1.5 font-mono text-[11px] text-danger">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
                  <span className="truncate">{item.statusMsg || 'Error occurred'}</span>
                </div>
                <pre className={logText}>{errorContent}</pre>
              </ScrollArea>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Kapat
          </Button>
          {onShowInFolder && item.destination && (
            <Button variant="outline" onClick={() => onShowInFolder(item.id)}>
              <FolderOpen />
              <span>Klasörde Göster</span>
            </Button>
          )}
          {onRetry && (
            <Button onClick={handleRetry}>
              <RotateCcw />
              <span>Yeniden Dene</span>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
