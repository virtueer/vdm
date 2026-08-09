import React, { useState, useEffect } from 'react';
import { Search, Zap, Check, AlertCircle, Loader2 } from 'lucide-react';

interface ProbeStatusProps {
    downloadId: string;
}

export function ProbeStatus({ downloadId }: ProbeStatusProps) {
    const [status, setStatus] = useState<'idle' | 'probing' | 'complete' | 'error'>('idle');
    const [speed, setSpeed] = useState<number>(0);
    const [threads, setThreads] = useState<number>(0);
    const [startTime, setStartTime] = useState<number>(0);

    useEffect(() => {
        const handleProbeStart = (evt: any) => {
            if (evt.data && evt.data.id === downloadId) {
                setStatus('probing');
                setStartTime(Date.now());
            }
        };

        const handleProbeComplete = (evt: any) => {
            if (evt.data && evt.data.id === downloadId) {
                setStatus('complete');
                setSpeed(evt.data.speed);
                setThreads(evt.data.threads);
            }
        };

        const unsubs = [
            Events.On('probe_start', handleProbeStart),
            Events.On('probe_complete', handleProbeComplete),
        ];

        return () => unsubs.forEach(unsub => unsub());
    }, [downloadId]);

    const formatSpeed = (bytesPerSec: number): string => {
        if (bytesPerSec < 1024) return `${bytesPerSec} B/s`;
        if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
        if (bytesPerSec < 1024 * 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
        return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
    };

    const elapsed = status === 'probing' ? Math.floor((Date.now() - startTime) / 1000) : 0;

    if (status === 'idle') return null;

    if (status === 'probing') {
        return (
            <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-1.5 bg-muted/50 rounded-md">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Checking server...</span>
                <span className="text-[10px] text-muted-foreground/70">{elapsed}s</span>
            </div>
        );
    }

    if (status === 'complete') {
        return (
            <div className="flex items-center gap-2 text-xs px-3 py-1.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded-md">
                <Check className="w-3 h-3" />
                <span>{formatSpeed(speed)}</span>
                <span className="text-muted-foreground/70">•</span>
                <span>{threads} threads</span>
            </div>
        );
    }

    return null;
}
