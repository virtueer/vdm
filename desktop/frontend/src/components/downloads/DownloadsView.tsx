import { Inbox } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { DownloadItem, ProbeInfo } from '../../types/download';
import { AddUrlCard } from './AddUrlCard';
import { DownloadCard } from './DownloadCard';

interface DownloadsViewProps {
  downloads: DownloadItem[];
  downloadLogs: Record<string, string[]>;
  probes: Record<string, ProbeInfo>;
  showManualInput: boolean;
  setShowManualInput: (show: boolean) => void;
  manualUrl: string;
  setManualUrl: (url: string) => void;
  manualTitle: string;
  setManualTitle: (title: string) => void;
  onManualDownload: (chosenFormatId?: string) => void;
  onOpenFormatModal: (target: { id?: string; url: string; title?: string }) => void;
  onViewLogs: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdateItemStatus: (id: string, status: string, msg: string) => void;
}

export function DownloadsView({
  downloads,
  downloadLogs,
  probes,
  showManualInput,
  setShowManualInput,
  manualUrl,
  setManualUrl,
  manualTitle,
  setManualTitle,
  onManualDownload,
  onOpenFormatModal,
  onViewLogs,
  onDelete,
  onUpdateItemStatus,
}: DownloadsViewProps) {
  const activeCount = downloads.filter((d) => d.status === 'downloading').length;
  const queuedCount = downloads.filter((d) => d.status === 'pending').length;
  const completedCount = downloads.filter((d) => d.status === 'completed').length;
  const erroredCount = downloads.filter(
    (d) => d.status === 'error' || d.status === 'cancelled'
  ).length;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="mb-3 shrink-0 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Downloads</h2>
          <p className="text-sm text-muted-foreground">Monitor and manage your media downloads.</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Active:</span>
            <span className="font-medium text-primary">{activeCount}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Queued:</span>
            <span className="font-medium text-foreground">{queuedCount}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Completed:</span>
            <span className="font-medium text-foreground">{completedCount}</span>
          </div>
          {erroredCount > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Errors:</span>
              <span className="font-medium text-destructive">{erroredCount}</span>
            </div>
          )}
        </div>
      </div>

      <AddUrlCard
        showManualInput={showManualInput}
        setShowManualInput={setShowManualInput}
        manualUrl={manualUrl}
        setManualUrl={setManualUrl}
        manualTitle={manualTitle}
        setManualTitle={setManualTitle}
        onManualDownload={onManualDownload}
        onOpenFormatModal={onOpenFormatModal}
      />

      <Card className="flex-1 overflow-hidden">
        {downloads.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <div className="bg-muted p-3 rounded-full mb-3">
              <Inbox className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="text-base font-medium">No downloads yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm mt-1">
              Send videos from the Chrome Extension to start downloading them directly to your PC.
            </p>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="p-4 space-y-2">
              {downloads.map((dl) => (
                <DownloadCard
                  key={dl.id}
                  item={dl}
                  logCount={downloadLogs[dl.id]?.length || 0}
                  probeInfo={probes[dl.id]}
                  onViewLogs={() => onViewLogs(dl.id)}
                  onDelete={() => onDelete(dl.id)}
                  onOpenFormats={() =>
                    onOpenFormatModal({ id: dl.id, url: dl.url, title: dl.title })
                  }
                  onUpdateItemStatus={onUpdateItemStatus}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </Card>
    </div>
  );
}
