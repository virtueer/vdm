import React, { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import type { DownloadItem } from '@/types';

interface DeleteModalProps {
  item: DownloadItem | null;
  onClose: () => void;
  onConfirm: (id: string, deleteFile: boolean) => void;
}

export const DeleteModal: React.FC<DeleteModalProps> = ({
  item,
  onClose,
  onConfirm,
}) => {
  const [deleteFileFromDisk, setDeleteFileFromDisk] = useState(true);

  if (!item) return null;

  const handleConfirm = () => {
    onConfirm(item.id, deleteFileFromDisk);
    onClose();
  };

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[460px] max-w-[calc(100vw-2rem)] overflow-hidden">
        <DialogHeader className="min-w-0">
          <div className="flex items-center gap-2.5 text-destructive mb-1 min-w-0">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-destructive/15 shrink-0">
              <AlertTriangle className="w-4 h-4 text-destructive" />
            </div>
            <DialogTitle className="truncate">İndirmeyi Sil</DialogTitle>
          </div>
          <DialogDescription className="break-words text-xs text-muted-foreground">
            Bu öğeyi indirme listenizden kaldırmak üzeresiniz.
          </DialogDescription>
        </DialogHeader>

        {/* File Preview Card */}
        <div className="p-3 bg-muted/60 rounded-lg border border-border/70 text-xs min-w-0 overflow-hidden flex flex-col gap-1">
          <p
            className="font-semibold text-foreground truncate select-all"
            title={item.title || item.url}
          >
            {item.title || item.url}
          </p>
          {item.destination && (
            <p
              className="text-muted-foreground truncate font-mono text-[11px] select-all"
              title={item.destination}
            >
              {item.destination}
            </p>
          )}
        </div>

        {/* Option to delete file from disk */}
        <div className="flex items-center justify-between p-3.5 rounded-lg border border-border/80 bg-background/80 hover:bg-muted/30 transition-colors gap-3 min-w-0 overflow-hidden">
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <label
              htmlFor="delete-file-switch"
              className="text-xs font-medium text-foreground cursor-pointer select-none truncate"
            >
              İndirilen dosyayı diskten de sil
            </label>
            <span className="text-[11px] text-muted-foreground leading-relaxed break-words">
              Bilgisayarınızdaki dosya ve geçici indirme verisi kalıcı olarak silinir.
            </span>
          </div>
          <Switch
            id="delete-file-switch"
            checked={deleteFileFromDisk}
            onCheckedChange={setDeleteFileFromDisk}
            className="shrink-0"
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0 mt-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
            className="gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Sil</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
