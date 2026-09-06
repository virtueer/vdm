import { useEffect, useState, useCallback } from 'react';
import { Events } from '@wailsio/runtime';
import { Header } from '@/components/Header';
import { DownloadCard } from '@/components/DownloadCard';
import { EmptyState } from '@/components/EmptyState';
import { DeleteModal } from '@/components/DeleteModal';
import { AddDownloadModal } from '@/components/AddDownloadModal';
import { MediaInfoModal } from '@/components/MediaInfoModal';
import { ErrorModal } from '@/components/ErrorModal';
import { ScrollArea } from '@/components/ui/scroll-area';
import { api } from '@/lib/api';
import type { DownloadItem, DownloadProgressPayload } from '@/types';

export default function App() {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<DownloadItem | null>(null);
  const [mediaInfoTarget, setMediaInfoTarget] = useState<DownloadItem | null>(null);
  const [errorTarget, setErrorTarget] = useState<DownloadItem | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshDownloads = useCallback(async (isManualScan = false) => {
    if (isManualScan) setIsRefreshing(true);
    try {
      const data = isManualScan ? await api.scanDownloads() : await api.getDownloads();
      if (Array.isArray(data)) {
        setDownloads(data);
      }
    } catch (e) {
      console.error('refresh error:', e);
    } finally {
      if (isManualScan) {
        setTimeout(() => setIsRefreshing(false), 400);
      }
    }
  }, []);

  // Load initial downloads on mount with multiple retries for bridge readiness
  useEffect(() => {
    refreshDownloads();

    const t1 = setTimeout(() => refreshDownloads(), 250);
    const t2 = setTimeout(() => refreshDownloads(), 800);
    const t3 = setTimeout(() => refreshDownloads(), 2000);

    const onFocus = () => refreshDownloads();
    window.addEventListener('focus', onFocus);

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
        // If error modal is open for this item, keep it updated
        setErrorTarget((prev) => (prev && prev.id === item.id ? { ...prev, ...item } : prev));
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
                statusMsg: (p as any).statusMsg || d.statusMsg,
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
        setErrorTarget((prev) => (prev && prev.id === id ? null : prev));
      }
    });

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener('focus', onFocus);
      if (typeof unsubNew === 'function') unsubNew();
      if (typeof unsubUpdated === 'function') unsubUpdated();
      if (typeof unsubProgress === 'function') unsubProgress();
      if (typeof unsubRemoved === 'function') unsubRemoved();
    };
  }, [refreshDownloads]);

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
        isRefreshing={isRefreshing}
        onRefresh={() => refreshDownloads(true)}
        onOpenAddModal={() => setIsAddModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 min-h-0 overflow-hidden bg-background">
        {downloads.length === 0 ? (
          <EmptyState
            isRefreshing={isRefreshing}
            onRefresh={() => refreshDownloads(true)}
            onOpenAddModal={() => setIsAddModalOpen(true)}
          />
        ) : (
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-3 p-6 max-w-5xl mx-auto w-full">
              {downloads.map((item) => (
                <DownloadCard
                  key={item.id}
                  item={item}
                  onPause={handlePause}
                  onResume={handleResume}
                  onShowInFolder={handleShowInFolder}
                  onShowMediaInfo={(target) => setMediaInfoTarget(target)}
                  onShowError={(target) => setErrorTarget(target)}
                  onDeleteRequest={(target) => setDeleteTarget(target)}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </main>

      {/* Error Details Modal */}
      <ErrorModal
        item={errorTarget}
        isOpen={!!errorTarget}
        onClose={() => setErrorTarget(null)}
        onRetry={handleResume}
        onShowInFolder={handleShowInFolder}
      />

      {/* Media Info Modal */}
      <MediaInfoModal
        item={mediaInfoTarget}
        isOpen={!!mediaInfoTarget}
        onClose={() => setMediaInfoTarget(null)}
        onShowInFolder={handleShowInFolder}
      />

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
