import React from "react";
import { Loader2, Check } from "lucide-react";
import type { ProbeInfo } from "../../types/download";
import { formatSpeed } from "../../utils/formatters";

export function ProbeStatus({ probeInfo }: { probeInfo?: ProbeInfo }) {
    if (!probeInfo) return null;

    if (probeInfo.status === 'probing') {
        const elapsed = Math.floor((Date.now() - probeInfo.startTime) / 1000);
        return (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Checking server...</span>
                <span className="text-[10px] text-muted-foreground/70">{elapsed}s</span>
            </div>
        );
    }

    if (probeInfo.status === 'complete') {
        return (
            <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                <Check className="w-3 h-3" />
                <span>{formatSpeed(probeInfo.speed)}</span>
                <span className="text-muted-foreground/70">•</span>
                <span>{probeInfo.threads} threads</span>
            </div>
        );
    }

    return null;
}
