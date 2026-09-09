import { lazy, Suspense, useCallback, useState } from 'react';
import { StatusBar } from '@/components/shell/StatusBar';
import { TitleBar } from '@/components/shell/TitleBar';
import { api } from '@/features/downloads/api';
import { DownloadList } from '@/features/downloads/components/DownloadList';
import { EmptyState } from '@/features/downloads/components/EmptyState';
import { useDownloads } from '@/features/downloads/hooks/useDownloads';
import type { DownloadItem } from '@/features/downloads/types';
import { useBridgeConnection } from '@/hooks/useBridgeConnection';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useLazyMount } from '@/hooks/useLazyMount';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';

// Overlays are opened on demand, so they ship as their own chunks.
const AddDownloadModal = lazy(() =>
  import('@/features/downloads/components/modals/AddDownloadModal').then((m) => ({
    default: m.AddDownloadModal,
  }))
);
const DeleteModal = lazy(() =>
  import('@/features/downloads/components/modals/DeleteModal').then((m) => ({
    default: m.DeleteModal,
  }))
);
const ErrorModal = lazy(() =>
  import('@/features/downloads/components/modals/ErrorModal').then((m) => ({
    default: m.ErrorModal,
  }))
);
const MediaInfoModal = lazy(() =>
  import('@/features/downloads/components/modals/MediaInfoModal').then((m) => ({
    default: m.MediaInfoModal,
  }))
);

const appShell = cn(
  'flex h-screen w-screen select-none flex-col overflow-hidden',
  'bg-background text-foreground'
);

export default function App() {
  const { downloads, isRefreshing, refresh, removeLocal } = useDownloads();
  const bridgeState = useBridgeConnection();
  const { theme, toggleTheme } = useTheme();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [mediaInfoId, setMediaInfoId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  // Overlay targets are derived from the list, so live updates and removals
  // reach the open modal without a second copy of the item to keep in sync.
  const findById = (id: string | null) => downloads.find((d) => d.id === id) ?? null;
  const deleteTarget = findById(deleteId);
  const mediaInfoTarget = findById(mediaInfoId);
  const errorTarget = findById(errorId);

  useHotkeys({
    'mod+k': () => setIsAddOpen(true),
    'mod+r': () => refresh(true),
  });

  const handlePause = useCallback((id: string) => api.pauseDownload(id), []);
  const handleResume = useCallback((id: string) => api.resumeDownload(id), []);
  const handleShowInFolder = useCallback((id: string) => api.showInFolder(id), []);
  const handleShowMediaInfo = useCallback((item: DownloadItem) => setMediaInfoId(item.id), []);
  const handleShowError = useCallback((item: DownloadItem) => setErrorId(item.id), []);
  const handleDeleteRequest = useCallback((item: DownloadItem) => setDeleteId(item.id), []);

  const handleDeleteConfirm = useCallback(
    async (id: string, deleteFile: boolean) => {
      await api.removeDownload(id, deleteFile);
      removeLocal(id);
    },
    [removeLocal]
  );

  const handleAddDownload = useCallback((url: string, title: string) => {
    api.addDownload(url, title);
  }, []);

  const showError = useLazyMount(!!errorTarget);
  const showMediaInfo = useLazyMount(!!mediaInfoTarget);
  const showDelete = useLazyMount(!!deleteTarget);
  const showAdd = useLazyMount(isAddOpen);

  const activeCount = downloads.filter(
    (d) => d.status === 'downloading' || d.status === 'pending'
  ).length;

  return (
    <div className={appShell}>
      <TitleBar
        activeCount={activeCount}
        totalCount={downloads.length}
        isRefreshing={isRefreshing}
        theme={theme}
        onToggleTheme={toggleTheme}
        onRefresh={() => refresh(true)}
        onOpenAddModal={() => setIsAddOpen(true)}
      />

      <main className="min-h-0 flex-1 overflow-hidden">
        {downloads.length === 0 ? (
          <EmptyState
            isRefreshing={isRefreshing}
            onRefresh={() => refresh(true)}
            onOpenAddModal={() => setIsAddOpen(true)}
          />
        ) : (
          <DownloadList
            downloads={downloads}
            onPause={handlePause}
            onResume={handleResume}
            onShowInFolder={handleShowInFolder}
            onShowMediaInfo={handleShowMediaInfo}
            onShowError={handleShowError}
            onDeleteRequest={handleDeleteRequest}
          />
        )}
      </main>

      <StatusBar downloads={downloads} connection={bridgeState} isRefreshing={isRefreshing} />

      <Suspense fallback={null}>
        {showError && (
          <ErrorModal
            item={errorTarget}
            isOpen={!!errorTarget}
            onClose={() => setErrorId(null)}
            onRetry={handleResume}
            onShowInFolder={handleShowInFolder}
          />
        )}

        {showMediaInfo && (
          <MediaInfoModal
            item={mediaInfoTarget}
            isOpen={!!mediaInfoTarget}
            onClose={() => setMediaInfoId(null)}
            onShowInFolder={handleShowInFolder}
          />
        )}

        {showDelete && (
          <DeleteModal
            item={deleteTarget}
            onClose={() => setDeleteId(null)}
            onConfirm={handleDeleteConfirm}
          />
        )}

        {showAdd && (
          <AddDownloadModal
            open={isAddOpen}
            onClose={() => setIsAddOpen(false)}
            onAdd={handleAddDownload}
          />
        )}
      </Suspense>
    </div>
  );
}
