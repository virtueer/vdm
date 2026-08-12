import { Check, Copy, Terminal } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GetDownloadLogs } from '../../../bindings/vdm/app';
import { TerminalLine } from '../terminal/TerminalLine';

interface ProcessLogModalProps {
  downloadId: string;
  downloadLogs: Record<string, string[]>;
  setDownloadLogs: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  onClose: () => void;
}

export function ProcessLogModal({
  downloadId,
  downloadLogs,
  setDownloadLogs,
  onClose,
}: ProcessLogModalProps) {
  const [copiedProcessLogs, setCopiedProcessLogs] = useState(false);

  useEffect(() => {
    GetDownloadLogs(downloadId)
      .then((savedLogs) => {
        if (Array.isArray(savedLogs) && savedLogs.length > 0) {
          setDownloadLogs((prev) => ({
            ...prev,
            [downloadId]: savedLogs,
          }));
        }
      })
      .catch(console.error);
  }, [downloadId, setDownloadLogs]);

  const logs = downloadLogs[downloadId] || [];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(logs.join('\n'));
      setCopiedProcessLogs(true);
      setTimeout(() => setCopiedProcessLogs(false), 1500);
    } catch (_e) {}
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-3xl h-[65vh] flex flex-col p-0 gap-0 overflow-hidden bg-zinc-950 border-zinc-800"
        hideClose
      >
        <DialogHeader className="px-4 py-2.5 bg-zinc-900 border-b border-zinc-800 flex flex-row items-center justify-between space-y-0 h-11 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
            </div>
            <div className="h-3.5 w-px bg-zinc-700/50" />
            <DialogTitle className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              Process Log History
            </DialogTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 gap-1.5 h-7 px-2.5"
          >
            {copiedProcessLogs ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>{copiedProcessLogs ? 'Copied!' : 'Copy All'}</span>
          </Button>
        </DialogHeader>

        <ScrollArea className="flex-1 p-4 bg-zinc-950">
          <div className="space-y-0.5 pb-4">
            {logs.length === 0 ? (
              <div className="text-zinc-600 italic font-mono text-xs p-2">
                No logs collected for this download yet.
              </div>
            ) : (
              logs.map((log, i) => <TerminalLine key={i} line={log} />)
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
