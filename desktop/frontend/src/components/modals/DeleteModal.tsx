import React, { useState } from "react";
import { Trash2 } from "lucide-react";
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card border shadow-xl rounded-xl max-w-md w-full p-6">
                <h3 className="text-base font-semibold mb-1 flex items-center gap-2">
                    <Trash2 className="w-5 h-5 text-destructive" />
                    Delete Download
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                    Are you sure you want to remove <strong className="text-foreground">{item.title || 'this download'}</strong> from the list?
                </p>

                <label className="flex items-start gap-3 p-3 rounded-lg border bg-muted/40 text-xs cursor-pointer mb-6 hover:bg-muted/70 transition-colors">
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

                <div className="flex justify-end gap-2.5">
                    <button 
                        onClick={onClose}
                        className="px-4 py-2 rounded-md hover:bg-muted transition-colors text-xs font-medium"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleDelete}
                        className="px-4 py-2 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors text-xs font-medium"
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}
