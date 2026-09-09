import { EyeOff } from 'lucide-react';
import type React from 'react';
import { MediaCard } from '@/components/media/MediaCard';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { VideoLink } from '@/types';

interface MediaListProps {
  links: VideoLink[];
  loading: boolean;
  kind: 'video' | 'audio';
  onSetHidden: (url: string, hidden: boolean) => void;
}

const hiddenRow = cn(
  'flex items-center gap-2 rounded-md border border-dashed border-border/60',
  'bg-muted/30 px-3 py-2'
);

const emptyText = 'p-8 text-center text-xs text-muted-foreground';

export const MediaList: React.FC<MediaListProps> = ({ links, loading, kind, onSetHidden }) => {
  if (loading) return <p className={emptyText}>Medya taranıyor…</p>;
  if (links.length === 0) {
    const label = kind === 'audio' ? 'ses' : 'video';
    return <p className={emptyText}>Bu sayfada {label} bulunamadı.</p>;
  }

  return (
    <div className="flex flex-col gap-2 p-2.5">
      {links.map((video) =>
        video.hidden ? (
          <div key={video.url} className={hiddenRow}>
            <EyeOff className="h-3 w-3 shrink-0 text-muted-foreground/60" />
            <span className="truncate font-mono text-[11px] text-muted-foreground/80">
              {video.url}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => onSetHidden(video.url, false)}
            >
              Geri al
            </Button>
          </div>
        ) : (
          <MediaCard key={video.url} video={video} onHide={() => onSetHidden(video.url, true)} />
        )
      )}
    </div>
  );
};
