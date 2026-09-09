import { AlertTriangle, Trash2 } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import type { DownloadItem } from '@/features/downloads/types';

interface DeleteModalProps {
  item: DownloadItem | null;
  onClose: () => void;
  onConfirm: (id: string, deleteFile: boolean) => void;
}

export const DeleteModal: React.FC<DeleteModalProps> = ({ item, onClose, onConfirm }) => {
  const [deleteFileFromDisk, setDeleteFileFromDisk] = useState(true);

  if (!item) return null;

  const handleConfirm = () => {
    onConfirm(item.id, deleteFileFromDisk);
    onClose();
  };

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-destructive/10">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
          </div>
          <div className="min-w-0">
            <DialogTitle>İndirmeyi Sil</DialogTitle>
            <DialogDescription>Bu öğe listeden kaldırılacak</DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-2.5 p-3.5">
          <div className="flex flex-col gap-1 rounded-md border border-border/60 bg-muted/30 p-3">
            <p className="truncate text-xs font-medium" title={item.title || item.url}>
              {item.title || item.url}
            </p>
            {item.destination && (
              <p
                className="select-text truncate font-mono text-[11px] tracking-tight text-muted-foreground"
                title={item.destination}
              >
                {item.destination}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 rounded-md border border-border/60 p-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <label htmlFor="delete-file-switch" className="cursor-pointer text-xs font-medium">
                Dosyayı diskten de sil
              </label>
              <span className="text-[11px] leading-relaxed text-muted-foreground">
                Dosya ve geçici indirme verisi kalıcı olarak silinir.
              </span>
            </div>
            <Switch
              id="delete-file-switch"
              checked={deleteFileFromDisk}
              onCheckedChange={setDeleteFileFromDisk}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            <Trash2 />
            <span>Sil</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
