import { DownloadCloud, Plus, RefreshCw } from 'lucide-react';
import type React from 'react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { shortcut } from '@/lib/format';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  isRefreshing?: boolean;
  onRefresh: () => void;
  onOpenAddModal: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  isRefreshing = false,
  onRefresh,
  onOpenAddModal,
}) => {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-lg border border-border/60 bg-muted/40">
        <DownloadCloud className="h-5 w-5 text-muted-foreground/70" />
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="text-sm font-semibold tracking-tight">Henüz bir indirme yok</h3>
        <p className="max-w-[400px] text-xs leading-relaxed text-muted-foreground">
          Tarayıcı eklentisinden video yakalayın ya da diskteki mevcut indirmeleri taratın.
        </p>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Button variant="outline" onClick={onRefresh} disabled={isRefreshing}>
          <RefreshCw className={cn(isRefreshing && 'animate-spin')} />
          <span>Klasörü Tara</span>
          <Kbd>{shortcut('R')}</Kbd>
        </Button>

        <Button variant="outline" onClick={onOpenAddModal}>
          <Plus />
          <span>URL Ekle</span>
          <Kbd>{shortcut('K')}</Kbd>
        </Button>
      </div>
    </div>
  );
};
