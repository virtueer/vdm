import React, { useRef, useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Terminal, Check, Copy, XCircle } from "lucide-react";
import { TerminalLine } from "./TerminalLine";
import { ClearTerminalLogs } from "../../../bindings/vdm/app";

interface LiveConsoleProps {
    logs: string[];
    terminalHeight: number;
    setTerminalHeight: (h: number) => void;
    onClear: () => void;
    onClose: () => void;
}

export function LiveConsole({ logs, terminalHeight, setTerminalHeight, onClear, onClose }: LiveConsoleProps) {
    const [copiedLogs, setCopiedLogs] = useState(false);
    const terminalEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (terminalEndRef.current && logs.length > 0 && logs.length <= 5) {
            terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [logs]);

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        const startY = e.clientY;
        const startH = terminalHeight;
        const onMouseMove = (moveEvt: MouseEvent) => {
            const deltaY = startY - moveEvt.clientY;
            const newH = Math.min(Math.max(startH + deltaY, 120), window.innerHeight - 150);
            setTerminalHeight(newH);
        };
        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(logs.join("\n"));
            setCopiedLogs(true);
            setTimeout(() => setCopiedLogs(false), 1500);
        } catch (e) {}
    };

    const handleClearLogs = () => {
        ClearTerminalLogs().catch(console.error);
        onClear();
    };

    return (
        <div 
            style={{ height: `${terminalHeight}px` }}
            className="border-t border-zinc-800 bg-zinc-950 w-full flex flex-col shrink-0 relative"
        >
            <div 
                onMouseDown={handleMouseDown}
                className="h-1.5 w-full bg-zinc-900 hover:bg-emerald-500/60 cursor-ns-resize transition-colors flex items-center justify-center group shrink-0 border-b border-zinc-800/60"
                title="Drag to resize console height"
            >
                <div className="w-10 h-1 rounded-full bg-zinc-700 group-hover:bg-emerald-300 transition-colors" />
            </div>

            <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/90 border-b border-zinc-800/80">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                        <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                    </div>
                    <div className="h-3.5 w-px bg-zinc-700/50" />
                    <div className="flex items-center gap-2 text-zinc-300">
                        <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-xs font-semibold tracking-wide">Live Console</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-mono font-medium">{logs.length} lines</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleCopy}
                        className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 px-2.5 py-1 rounded transition-colors"
                        title="Copy all live logs"
                    >
                        {copiedLogs ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span className="font-medium">{copiedLogs ? "Copied!" : "Copy All"}</span>
                    </button>
                    <button 
                        onClick={handleClearLogs} 
                        className="text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 px-2.5 py-1 rounded transition-colors font-medium"
                    >
                        Clear
                    </button>
                    <button 
                        onClick={onClose} 
                        className="text-xs text-zinc-400 hover:text-rose-400 hover:bg-zinc-800/80 p-1 rounded transition-colors"
                        title="Close Live Console"
                    >
                        <XCircle className="w-4 h-4" />
                    </button>
                </div>
            </div>
            <ScrollArea className="flex-1 p-3">
                <div className="space-y-0.5 pb-4">
                    {logs.length === 0 ? (
                        <div className="text-zinc-600 font-mono text-xs italic py-2">Waiting for console output...</div>
                    ) : (
                        logs.map((log, i) => (
                            <TerminalLine key={i} line={log} />
                        ))
                    )}
                    <div ref={terminalEndRef} />
                </div>
            </ScrollArea>
        </div>
    );
}
