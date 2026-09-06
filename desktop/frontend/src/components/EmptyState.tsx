import React from 'react';
import { DownloadCloud, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  onOpenAddModal: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onOpenAddModal }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 select-none">
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-muted/60 border border-border/80 text-muted-foreground mb-4 shadow-sm">
        <DownloadCloud className="w-8 h-8 opacity-75" />
      </div>
      <h3 className="text-lg font-medium text-foreground mb-1.5">
        Henüz bir indirme yok
      </h3>
      <p className="text-xs text-muted-foreground max-w-sm mb-5 leading-relaxed">
        Chrome eklentisinden videoları yakalayıp <strong>İndir</strong> butonuna basabilir veya doğrudan video linki ekleyebilirsiniz.
      </p>
      <Button onClick={onOpenAddModal} variant="outline" size="sm" className="gap-1.5">
        <Plus className="w-3.5 h-3.5" />
        <span>Yeni İndirme Başlat</span>
      </Button>
    </div>
  );
};
