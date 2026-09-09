import { memo } from 'react';
import { DownloadCard } from '@/features/downloads/components/DownloadCard';
import type { DownloadItem } from '@/features/downloads/types';

interface DownloadListProps {
  downloads: DownloadItem[];
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onShowInFolder: (id: string) => void;
  onShowMediaInfo: (item: DownloadItem) => void;
  onShowError: (item: DownloadItem) => void;
  onDeleteRequest: (item: DownloadItem) => void;
}

/** Scroll container for the download rows; `card-item` keeps long lists cheap. */
export const DownloadList = memo(function DownloadList({
  downloads,
  ...handlers
}: DownloadListProps) {
  return (
    <div className="smooth-scroll h-full">
      <div className="flex flex-col gap-2 p-3">
        {downloads.map((item) => (
          <div key={item.id} className="card-item">
            <DownloadCard item={item} {...handlers} />
          </div>
        ))}
      </div>
    </div>
  );
});
