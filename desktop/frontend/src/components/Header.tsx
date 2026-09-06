import React from 'react';
import { Download, Plus, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface HeaderProps {
  activeCount: number;
  totalCount: number;
  onOpenAddModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeCount,
  totalCount,
  onOpenAddModal,
}) => {
  return (
    <header className="flex items-center justify-between px-6 py-3.5 border-b bg-card/60 backdrop-blur-md select-none shrink-0">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground shadow-sm">
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
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
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
        <Button onClick={onOpenAddModal} size="sm" className="gap-1.5 shadow-sm">
          <Plus className="w-4 h-4" />
          <span>URL İndir</span>
        </Button>
      </div>
    </header>
  );
};
