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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5 text-destructive mb-1">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-destructive/15">
              <AlertTriangle className="w-4 h-4 text-destructive" />
            </div>
            <DialogTitle>İndirmeyi Sil</DialogTitle>
          </div>
          <DialogDescription>
            Bu öğeyi indirme listenizden kaldırmak üzeresiniz.
          </DialogDescription>
        </DialogHeader>

        <div className="p-3 bg-muted/60 rounded-lg border border-border/70 text-xs">
          <p className="font-semibold text-foreground truncate mb-1">
            {item.title || item.url}
          </p>
          {item.destination && (
            <p className="text-muted-foreground truncate font-mono text-[11px]">
              {item.destination}
            </p>
          )}
        </div>

        {/* Option to delete file from disk */}
        <div className="flex items-center justify-between p-3.5 rounded-lg border border-border/80 bg-background/80 hover:bg-muted/30 transition-colors">
          <div className="flex flex-col gap-0.5 pr-4">
            <label
              htmlFor="delete-file-switch"
              className="text-xs font-medium text-foreground cursor-pointer"
            >
              İndirilen dosyayı diskten de sil
            </label>
            <span className="text-[11px] text-muted-foreground">
              Bilgisayarınızdaki dosya ve geçici indirme verisi kalıcı olarak silinir.
            </span>
          </div>
          <Switch
            id="delete-file-switch"
            checked={deleteFileFromDisk}
            onCheckedChange={setDeleteFileFromDisk}
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
