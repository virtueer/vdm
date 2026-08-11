import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { DownloadItem } from "../../types/download";
import { CancelDownload, RemoveDownload } from "../../../bindings/vdm/app";

interface DeleteModalProps {
    item: DownloadItem;
    onClose: () => void;
}

export function DeleteModal({ item, onClose }: DeleteModalProps) {
    const [deleteFileFromDisk, setDeleteFileFromDisk] = useState<boolean>(true);

    const handleDelete = () => {
        if (item.status === 'downloading' || item.status === 'pending' || item.status === 'paused') {
            CancelDownload(item.id).catch(console.error);
        }
        RemoveDownload(item.id, deleteFileFromDisk).catch(console.error);
        onClose();
    };

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-md p-6">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-base">
                        <Trash2 className="w-5 h-5 text-destructive" />
                        Delete Download
                    </DialogTitle>
                </DialogHeader>

                <p className="text-sm text-muted-foreground my-2">
                    Are you sure you want to remove <strong className="text-foreground">{item.title || 'this download'}</strong> from the list?
                </p>

                <label className="flex items-start gap-3 p-3 rounded-lg border bg-muted/40 text-xs cursor-pointer my-2 hover:bg-muted/70 transition-colors">
                    <input 
                        type="checkbox" 
                        checked={deleteFileFromDisk} 
                        onChange={(e) => setDeleteFileFromDisk(e.target.checked)}
                        className="rounded border-input text-destructive focus:ring-destructive mt-0.5 w-4 h-4"
                    />
                    <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="font-semibold text-foreground">Also delete downloaded file from disk</span>
                        <span className="text-[11px] text-muted-foreground font-mono truncate">
                            {item.destination || 'File in Downloads folder'}
                        </span>
                    </div>
                </label>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="ghost" size="sm" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button variant="destructive" size="sm" onClick={handleDelete}>
                        Delete
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
