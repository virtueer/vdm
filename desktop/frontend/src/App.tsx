import { useEffect, useState } from 'react';
import { Events } from '@wailsio/runtime';
import { Header } from '@/components/Header';
import { DownloadCard } from '@/components/DownloadCard';
import { EmptyState } from '@/components/EmptyState';
import { DeleteModal } from '@/components/DeleteModal';
import { AddDownloadModal } from '@/components/AddDownloadModal';
import { ScrollArea } from '@/components/ui/scroll-area';
import { api } from '@/lib/api';
import type { DownloadItem, DownloadProgressPayload } from '@/types';

export default function App() {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<DownloadItem | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Load initial downloads on mount
  useEffect(() => {
    api.getDownloads().then((data) => {
      if (Array.isArray(data)) {
        setDownloads(data);
      }
    });

    // Listen to Wails runtime events
    const unsubNew = Events.On('new_download', (event) => {
      const item = (event.data?.[0] || event.data) as DownloadItem;
      if (item && item.id) {
        setDownloads((prev) => [
          item,
          ...prev.filter((d) => d.id !== item.id),
        ]);
      }
    });

    const unsubUpdated = Events.On('download_updated', (event) => {
      const item = (event.data?.[0] || event.data) as DownloadItem;
      if (item && item.id) {
        setDownloads((prev) =>
          prev.map((d) => (d.id === item.id ? { ...d, ...item } : d))
        );
      }
    });

    const unsubProgress = Events.On('download_progress', (event) => {
      const p = (event.data?.[0] || event.data) as DownloadProgressPayload;
      if (p && p.id) {
        const pct = parseFloat(p.percentage) || 0;
        setDownloads((prev) =>
          prev.map((d) => {
            if (d.id === p.id) {
              return {
                ...d,
                progress: pct,
                speed: p.speed,
                downloadedSize: p.downloaded,
                totalSize: p.total || d.totalSize,
              };
            }
            return d;
          })
        );
      }
    });

    const unsubRemoved = Events.On('download_removed', (event) => {
      const id = (event.data?.[0] || event.data) as string;
      if (id) {
        setDownloads((prev) => prev.filter((d) => d.id !== id));
      }
    });

    return () => {
      if (typeof unsubNew === 'function') unsubNew();
      if (typeof unsubUpdated === 'function') unsubUpdated();
      if (typeof unsubProgress === 'function') unsubProgress();
      if (typeof unsubRemoved === 'function') unsubRemoved();
    };
  }, []);

  const handlePause = async (id: string) => {
    await api.pauseDownload(id);
  };

  const handleResume = async (id: string) => {
    await api.resumeDownload(id);
  };

  const handleShowInFolder = async (id: string) => {
    await api.showInFolder(id);
  };

  const handleDeleteConfirm = async (id: string, deleteFile: boolean) => {
    await api.removeDownload(id, deleteFile);
    setDownloads((prev) => prev.filter((d) => d.id !== id));
  };

  const handleAddDownload = async (url: string, title: string) => {
    await api.addDownload(url, title);
  };

  const activeCount = downloads.filter(
    (d) => d.status === 'downloading' || d.status === 'pending'
  ).length;

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-foreground select-none overflow-hidden">
      {/* Header */}
      <Header
        activeCount={activeCount}
        totalCount={downloads.length}
        onOpenAddModal={() => setIsAddModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 min-h-0 overflow-hidden bg-background">
        {downloads.length === 0 ? (
          <EmptyState onOpenAddModal={() => setIsAddModalOpen(true)} />
        ) : (
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-3 p-6 max-w-4xl mx-auto">
              {downloads.map((item) => (
                <DownloadCard
                  key={item.id}
                  item={item}
                  onPause={handlePause}
                  onResume={handleResume}
                  onShowInFolder={handleShowInFolder}
                  onDeleteRequest={(target) => setDeleteTarget(target)}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      <DeleteModal
        item={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
      />

      {/* Add Download Modal */}
      <AddDownloadModal
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={handleAddDownload}
      />
    </div>
  );
}
