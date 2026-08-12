import { Trash2 } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RemoveDownload } from '../../../bindings/vdm/app';
import type { DownloadItem } from '../../types/download';

interface DeleteModalProps {
  item: DownloadItem;
  onClose: () => void;
}

export function DeleteModal({ item, onClose }: DeleteModalProps) {
  const [deleteFileFromDisk, setDeleteFileFromDisk] = useState<boolean>(true);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await RemoveDownload(item.id, deleteFileFromDisk);
    } catch (err) {
      console.error('Failed to remove download:', err);
    } finally {
      setDeleting(false);
      onClose();
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !deleting && onClose()}>
      <DialogContent className="sm:max-w-md w-full p-6 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Trash2 className="w-5 h-5 text-destructive shrink-0" />
            Delete Download
          </DialogTitle>
          <DialogDescription className="text-left pt-2 break-words">
            Are you sure you want to remove{' '}
            <span className="font-semibold text-foreground break-words">
              {item.title || 'this download'}
            </span>{' '}
            from the list?
          </DialogDescription>
        </DialogHeader>

        <Label
          htmlFor="delete-file-switch"
          className="flex items-center justify-between gap-3 p-3.5 rounded-lg border bg-muted/40 text-xs cursor-pointer hover:bg-muted/70 transition-colors w-full min-w-0 overflow-hidden"
        >
          <div className="flex flex-col gap-0.5 min-w-0 flex-1 overflow-hidden">
            <span className="font-medium text-foreground text-xs truncate block">
              Also delete downloaded file from disk
            </span>
            <span
              className="text-[11px] text-muted-foreground font-mono truncate block w-full"
              title={item.destination || 'File in Downloads folder'}
            >
              {item.destination || 'File in Downloads folder'}
            </span>
          </div>
          <Switch
            id="delete-file-switch"
            checked={deleteFileFromDisk}
            onCheckedChange={setDeleteFileFromDisk}
            disabled={deleting}
            className="shrink-0"
          />
        </Label>

        <DialogFooter className="gap-2 sm:gap-0 mt-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
