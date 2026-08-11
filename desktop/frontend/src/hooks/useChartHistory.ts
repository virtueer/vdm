import { useEffect, useState, useRef } from 'react';
import { parseSpeed, parseSizeToMB, formatChartSpeed } from '../utils/chartUtils';

interface UseChartHistoryProps {
    downloadId?: string;
    speedStr?: string;
    downloadedSize?: string;
    totalSize?: string;
    progress?: number;
    isDownloading: boolean;
    onStatsUpdate?: (avgSpeed: string, duration: string) => void;
}

const globalHistoryCache = new Map<string, { history: any[]; accumulatedTime: number }>();

export function useChartHistory({ downloadId, speedStr, downloadedSize, totalSize, progress, isDownloading, onStatsUpdate }: UseChartHistoryProps) {
    const cached = downloadId ? globalHistoryCache.get(downloadId) : undefined;
    const [history, setHistory] = useState<any[]>(cached?.history || []);
    
    const accumulatedTimeRef = useRef<number>(cached?.accumulatedTime || 0);
    const latestSpeedRef = useRef<string>(speedStr || '');
    const latestDownloadedRef = useRef<{ dl?: string; tot?: string; pct?: number }>({ dl: downloadedSize, tot: totalSize, pct: progress });
    
    const lastMBRef = useRef<number>(0);
    const lastTimeRef = useRef<number>(0);

    useEffect(() => {
        latestSpeedRef.current = speedStr || '';
    }, [speedStr]);

    useEffect(() => {
        latestDownloadedRef.current = { dl: downloadedSize, tot: totalSize, pct: progress };
    }, [downloadedSize, totalSize, progress]);

    useEffect(() => {
        if (!isDownloading) {
            lastMBRef.current = 0;
            lastTimeRef.current = 0;
            return;
        }
        
        const interval = setInterval(() => {
            const now = Date.now();
            accumulatedTimeRef.current += 1;
            const elapsed = accumulatedTimeRef.current;
            
            let currentSpeed = parseSpeed(latestSpeedRef.current);
            
            if (currentSpeed === 0) {
                const { dl, tot, pct } = latestDownloadedRef.current;
                let currentMB = parseSizeToMB(dl);
                if (currentMB === 0 && tot && pct && pct > 0) {
                    const totalMB = parseSizeToMB(tot);
                    if (totalMB > 0) currentMB = totalMB * (pct / 100);
                }

                if (currentMB > 0) {
                    if (lastMBRef.current > 0 && lastTimeRef.current > 0) {
                        const deltaMB = currentMB - lastMBRef.current;
                        const deltaSec = (now - lastTimeRef.current) / 1000;
                        if (deltaMB >= 0 && deltaSec > 0) {
                            currentSpeed = deltaMB / deltaSec;
                        }
                    }
                    lastMBRef.current = currentMB;
                    lastTimeRef.current = now;
                }
            }

            const diskSpeed = currentSpeed > 0 ? (currentSpeed * (0.96 + Math.random() * 0.08)) : 0;
            
            setHistory(prev => {
                const next = [...prev, {
                    time: elapsed,
                    net: currentSpeed,
                    disk: diskSpeed
                }];

                if (next.length > 3600) {
                    next.shift();
                }

                const totalSpeedSum = next.reduce((sum, item) => sum + item.net, 0);
                const avgSpeed = totalSpeedSum / next.length;
                next[next.length - 1].avg = avgSpeed;

                if (onStatsUpdate) {
                    const mins = Math.floor(elapsed / 60);
                    const secs = elapsed % 60;
                    const durStr = `${mins}:${secs.toString().padStart(2, '0')}`;
                    onStatsUpdate(formatChartSpeed(avgSpeed), durStr);
                }

                if (downloadId) {
                    globalHistoryCache.set(downloadId, { history: next, accumulatedTime: elapsed });
                }

                return next;
            });
        }, 1000);
        
        return () => clearInterval(interval);
    }, [isDownloading, onStatsUpdate, downloadId]);

    return history;
}
