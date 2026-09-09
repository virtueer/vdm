import { Download, Link as LinkIcon } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Kbd, kbdOnPrimary } from '@/components/ui/kbd';

interface AddDownloadModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (url: string, title: string) => void;
}

const labelClass = 'text-[11px] font-medium uppercase tracking-wide text-muted-foreground';

export const AddDownloadModal: React.FC<AddDownloadModalProps> = ({ open, onClose, onAdd }) => {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = url.trim();
    if (!cleanUrl) {
      setError('Geçerli bir URL girin');
      return;
    }
    onAdd(cleanUrl, title.trim());
    setUrl('');
    setTitle('');
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-w-[440px]">
        <form onSubmit={handleSubmit} className="flex flex-col">
          <DialogHeader>
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-muted">
              <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <DialogTitle>Yeni İndirme</DialogTitle>
              <DialogDescription>Dosya veya video bağlantısını yapıştırın</DialogDescription>
            </div>
          </DialogHeader>

          <div className="flex flex-col gap-3.5 p-3.5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="url" className={labelClass}>
                URL <span className="text-destructive">*</span>
              </label>
              <Input
                id="url"
                placeholder="https://example.com/video.mp4"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (error) setError('');
                }}
                className="font-mono tracking-tight"
                autoFocus
              />
              {error && <span className="text-[11px] text-destructive">{error}</span>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="title" className={labelClass}>
                Başlık <span className="normal-case text-muted-foreground/50">(opsiyonel)</span>
              </label>
              <Input
                id="title"
                placeholder="Ders Videosu — Bölüm 1"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <span className="mr-auto flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
              <Kbd>Esc</Kbd>
              <span>kapat</span>
            </span>
            <Button type="button" variant="ghost" onClick={onClose}>
              İptal
            </Button>
            <Button type="submit">
              <Download />
              <span>Başlat</span>
              <Kbd className={kbdOnPrimary}>⏎</Kbd>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
