import React, { useState } from 'react';
import { Download, Link as LinkIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface AddDownloadModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (url: string, title: string) => void;
}

export const AddDownloadModal: React.FC<AddDownloadModalProps> = ({
  open,
  onClose,
  onAdd,
}) => {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = url.trim();
    if (!cleanUrl) {
      setError('Lütfen geçerli bir URL girin');
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
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <div className="flex items-center gap-2 text-primary mb-1">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10">
                <LinkIcon className="w-4 h-4 text-primary" />
              </div>
              <DialogTitle>Yeni İndirme Başlat</DialogTitle>
            </div>
            <DialogDescription>
              İndirmek istediğiniz dosya veya video bağlantısını yapıştırın.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3.5 my-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="url" className="text-xs font-medium text-foreground">
                İndirme URL'si <span className="text-destructive">*</span>
              </label>
              <Input
                id="url"
                placeholder="https://example.com/video.mp4"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (error) setError('');
                }}
                autoFocus
              />
              {error && <span className="text-[11px] text-destructive">{error}</span>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="title" className="text-xs font-medium text-foreground">
                Başlık / Dosya Adı (İsteğe Bağlı)
              </label>
              <Input
                id="title"
                placeholder="Örn: Ders Videosu Bölüm 1"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              İptal
            </Button>
            <Button type="submit" size="sm" className="gap-1.5">
              <Download className="w-3.5 h-3.5" />
              <span>İndirmeyi Başlat</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
