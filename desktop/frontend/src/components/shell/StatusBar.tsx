import { ArrowDown } from 'lucide-react';
import type React from 'react';
import { useMemo } from 'react';
import type { DownloadItem } from '@/features/downloads/types';
import { BRIDGE_LABEL, type ConnectionState } from '@/lib/bridge';
import { formatSpeed, parseSpeed } from '@/lib/format';
import { cn } from '@/lib/utils';

interface StatusBarProps {
  downloads: DownloadItem[];
  connection: ConnectionState;
  isRefreshing?: boolean;
}

const statusBar = cn(
  'flex h-7 shrink-0 items-center gap-3 border-t border-border/60 bg-card/70 px-3',
  'font-mono text-[11px] tracking-tight text-muted-foreground'
);

const CONNECTION_META: Record<ConnectionState, { dot: string; label: string }> = {
  connected: { dot: 'bg-success', label: 'bağlı' },
  disconnected: { dot: 'bg-danger', label: 'bağlantı yok' },
  unknown: { dot: 'bg-warning', label: 'kontrol ediliyor' },
};

const Divider = () => <span className="h-3 w-px shrink-0 bg-border" />;

export const StatusBar: React.FC<StatusBarProps> = ({
  downloads,
  connection,
  isRefreshing = false,
}) => {
  const stats = useMemo(() => {
    let active = 0;
    let queued = 0;
    let failed = 0;
    let completed = 0;
    let speed = 0;

    for (const item of downloads) {
      if (item.status === 'downloading') {
        active += 1;
        speed += parseSpeed(item.speed);
      } else if (item.status === 'queued' || item.status === 'pending') {
        queued += 1;
      } else if (item.status === 'error') {
        failed += 1;
      } else if (item.status === 'completed') {
        completed += 1;
      }
    }

    return { active, queued, failed, completed, speed };
  }, [downloads]);

  const bridge = CONNECTION_META[connection];

  return (
    <footer className={statusBar}>
      <span
        className="flex items-center gap-2"
        title={`Tarayıcı eklentisi köprüsü — ${bridge.label}`}
      >
        <span className={cn('h-1.5 w-1.5 rounded-full', bridge.dot)} />
        <span className={cn(connection === 'disconnected' && 'text-danger')}>{BRIDGE_LABEL}</span>
        {connection !== 'connected' && <span>· {bridge.label}</span>}
      </span>

      <Divider />
      <span>{stats.active} aktif</span>
      <span>{stats.queued} kuyrukta</span>
      {stats.failed > 0 && <span className="text-danger">{stats.failed} hata</span>}

      <span className="ml-auto flex items-center gap-3">
        {isRefreshing && <span className="text-foreground/70">taranıyor…</span>}
        <span className="flex items-center gap-1.5 text-foreground/80">
          <ArrowDown className="h-3 w-3" />
          {formatSpeed(stats.speed)}
        </span>
        <Divider />
        <span>
          {stats.completed}/{downloads.length} tamamlandı
        </span>
      </span>
    </footer>
  );
};
