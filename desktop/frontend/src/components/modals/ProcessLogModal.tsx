import React, { useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Terminal, Check, Copy, XCircle } from "lucide-react";
import { TerminalLine } from "../terminal/TerminalLine";
import { GetDownloadLogs } from "../../../bindings/vdm/app";

interface ProcessLogModalProps {
    downloadId: string;
    downloadLogs: Record<string, string[]>;
    setDownloadLogs: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
    onClose: () => void;
}

export function ProcessLogModal({ downloadId, downloadLogs, setDownloadLogs, onClose }: ProcessLogModalProps) {
    const [copiedProcessLogs, setCopiedProcessLogs] = useState(false);

    useEffect(() => {
        GetDownloadLogs(downloadId).then((savedLogs) => {
            if (Array.isArray(savedLogs) && savedLogs.length > 0) {
                setDownloadLogs(prev => ({
                    ...prev,
                    [downloadId]: savedLogs
                }));
            }
        }).catch(console.error);
    }, [downloadId, setDownloadLogs]);

    const logs = downloadLogs[downloadId] || [];

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(logs.join("\n"));
            setCopiedProcessLogs(true);
            setTimeout(() => setCopiedProcessLogs(false), 1500);
        } catch(e) {}
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-zinc-950 border border-zinc-800 shadow-2xl rounded-xl max-w-3xl w-full flex flex-col h-[65vh] overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 bg-zinc-900 border-b border-zinc-800">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                            <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                        </div>
                        <div className="h-3.5 w-px bg-zinc-700/50" />
                        <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                            <Terminal className="w-4 h-4 text-emerald-400" />
                            Process Log History
                        </h3>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleCopy}
                            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 px-2.5 py-1 rounded transition-colors"
                            title="Copy all process logs"
                        >
                            {copiedProcessLogs ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            <span className="font-medium">{copiedProcessLogs ? "Copied!" : "Copy All"}</span>
                        </button>
                        <button 
                            onClick={onClose}
                            className="p-1 text-zinc-400 hover:text-zinc-100 rounded-md hover:bg-zinc-800 transition-colors"
                        >
                            <XCircle className="w-4 h-4" />
                        </button>
                    </div>
                </div>
                <ScrollArea className="flex-1 p-4 bg-zinc-950">
                    <div className="space-y-0.5 pb-4">
                        {logs.length === 0 ? (
                            <div className="text-zinc-600 italic font-mono text-xs p-2">No logs collected for this download yet.</div>
                        ) : (
                            logs.map((log, i) => (
                                <TerminalLine key={i} line={log} />
                            ))
                        )}
                    </div>
                </ScrollArea>
            </div>
        </div>
    );
}
