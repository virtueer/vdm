import React from "react";

export function TerminalLine({ line }: { line: string }) {
    const tsMatch = line.match(/^(\[\d{2}:\d{2}:\d{2}\])\s*(.*)$/);
    let timeStr = "";
    let content = line;
    if (tsMatch) {
        timeStr = tsMatch[1];
        content = tsMatch[2];
    }

    let colorClass = "text-zinc-300";

    if (content.startsWith("Executing command:") || content.startsWith("New download request:")) {
        colorClass = "text-amber-400 font-medium";
    } else if (content.includes("Download completed") || content.includes("Command started successfully")) {
        colorClass = "text-emerald-400 font-medium";
    } else if (content.toLowerCase().includes("error") || content.toLowerCase().includes("failed") || content.includes("Deleting partial") || content.includes("Deleting file")) {
        colorClass = "text-rose-400";
    } else if (content.startsWith("[youtube]") || content.startsWith("[info]")) {
        colorClass = "text-sky-400";
    } else if (content.startsWith("[download]")) {
        colorClass = "text-teal-300";
    } else if (content.startsWith("[#")) {
        colorClass = "text-emerald-400 font-mono";
    }

    return (
        <div className="flex items-start gap-2 text-[11px] font-mono py-0.5 border-b border-zinc-800/40 hover:bg-zinc-800/30 px-1.5 rounded transition-colors group">
            {timeStr && (
                <span className="text-zinc-500 group-hover:text-zinc-400 font-medium select-none shrink-0 text-[10px] pt-0.5">
                    {timeStr}
                </span>
            )}
            <span className={`break-all leading-relaxed ${colorClass}`}>
                {content}
            </span>
        </div>
    );
}
