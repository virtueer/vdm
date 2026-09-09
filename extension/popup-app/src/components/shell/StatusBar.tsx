import type React from 'react';
import { BRIDGE_LABEL, type ConnectionState } from '@/lib/bridge';
import { cn } from '@/lib/utils';

interface StatusBarProps {
  connection: ConnectionState;
  mediaCount: number;
  hiddenCount: number;
  autoIntercept: boolean;
}

const statusBar = cn(
  'flex h-7 shrink-0 items-center gap-2.5 border-t border-border/60 bg-card/70 px-3',
  'font-mono text-[11px] tracking-tight text-muted-foreground'
);

const CONNECTION_META: Record<ConnectionState, { dot: string; label: string }> = {
  connected: { dot: 'bg-success', label: 'bağlı' },
  disconnected: { dot: 'bg-danger', label: 'uygulama kapalı' },
  unknown: { dot: 'bg-warning', label: 'kontrol ediliyor' },
};

export const StatusBar: React.FC<StatusBarProps> = ({
  connection,
  mediaCount,
  hiddenCount,
  autoIntercept,
}) => {
  const bridge = CONNECTION_META[connection];

  return (
    <footer className={statusBar}>
      <span className="flex min-w-0 items-center gap-1.5" title={`VDM ${bridge.label}`}>
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', bridge.dot)} />
        <span className={cn('truncate', connection === 'disconnected' && 'text-danger')}>
          {connection === 'connected' ? BRIDGE_LABEL : bridge.label}
        </span>
      </span>

      <span className="h-3 w-px shrink-0 bg-border" />
      <span>{mediaCount} medya</span>
      {hiddenCount > 0 && <span>{hiddenCount} gizli</span>}

      <span className={cn('ml-auto', autoIntercept ? 'text-success' : 'text-muted-foreground/60')}>
        auto {autoIntercept ? 'on' : 'off'}
      </span>
    </footer>
  );
};
