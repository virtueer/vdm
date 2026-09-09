import { ChevronRight, Download, Moon, Plus, RefreshCw, Sun } from 'lucide-react';
import type React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Kbd, kbdOnPrimary } from '@/components/ui/kbd';
import { shortcut } from '@/lib/format';
import type { Theme } from '@/lib/theme';
import { cn } from '@/lib/utils';

interface TitleBarProps {
  activeCount: number;
  totalCount: number;
  isRefreshing?: boolean;
  theme: Theme;
  onToggleTheme: () => void;
  onRefresh: () => void;
  onOpenAddModal: () => void;
}

const titleBar = cn(
  'drag-region flex h-10 shrink-0 items-center gap-2.5',
  'border-b border-border/60 bg-card/70 px-3'
);

export const TitleBar: React.FC<TitleBarProps> = ({
  activeCount,
  totalCount,
  isRefreshing = false,
  theme,
  onToggleTheme,
  onRefresh,
  onOpenAddModal,
}) => {
  return (
    <header className={titleBar}>
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-muted text-foreground/80">
          <Download className="h-3.5 w-3.5" />
        </div>

        <nav className="flex min-w-0 items-center gap-2 text-[13px]">
          <span className="font-medium tracking-tight text-foreground/90">VDM</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
          <span className="truncate text-muted-foreground">İndirmeler</span>
          {totalCount > 0 && (
            <span className="font-mono text-[11px] tracking-tight text-muted-foreground/60">
              {totalCount}
            </span>
          )}
        </nav>

        {activeCount > 0 && <Badge variant="info">{activeCount} aktif</Badge>}
      </div>

      <div className="no-drag ml-auto flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'}
        >
          {theme === 'dark' ? <Sun /> : <Moon />}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={onRefresh}
          disabled={isRefreshing}
          title={`İndirilenler klasörünü tara (${shortcut('R')})`}
        >
          <RefreshCw className={cn(isRefreshing && 'animate-spin')} />
        </Button>

        <Button onClick={onOpenAddModal} title={`Yeni indirme (${shortcut('K')})`}>
          <Plus />
          <span>URL Ekle</span>
          <Kbd className={kbdOnPrimary}>{shortcut('K')}</Kbd>
        </Button>
      </div>
    </header>
  );
};
