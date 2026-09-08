import React from 'react';
import { Download, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface HeaderProps {
  activeCount: number;
  totalCount: number;
  isRefreshing?: boolean;
  onRefresh: () => void;
  onOpenAddModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeCount,
  totalCount,
  isRefreshing = false,
  onRefresh,
  onOpenAddModal,
}) => {
  return (
    <header className="flex items-center justify-between px-6 py-3.5 border-b bg-card select-none shrink-0 shadow-xs">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground shadow-xs">
          <Download className="w-4 h-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold tracking-tight text-foreground">
              Video Download Manager
            </h1>
            {totalCount > 0 && (
              <Badge variant="secondary" className="text-[11px] px-2 py-0">
                {totalCount} {totalCount === 1 ? 'öğe' : 'öğe'}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 shrink-0"></span>
            <span>Eklentiye bağlı (:9614)</span>
            {activeCount > 0 && (
              <span className="text-primary font-medium ml-1">
                • {activeCount} indirme aktif
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="gap-1.5 shadow-sm text-xs"
          title="İndirilenler klasörünü tara ve geçmişi yenile"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>Yenile</span>
        </Button>
        <Button onClick={onOpenAddModal} size="sm" className="gap-1.5 shadow-sm">
          <Plus className="w-4 h-4" />
          <span>URL İndir</span>
        </Button>
      </div>
    </header>
  );
};
