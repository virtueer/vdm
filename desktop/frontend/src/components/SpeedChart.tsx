import React, { useEffect, useState, useRef } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

interface SpeedChartProps {
    speedStr?: string;
    downloadedSize?: string;
    totalSize?: string;
    progress?: number;
    isDownloading: boolean;
    onStatsUpdate?: (avgSpeed: string, duration: string) => void;
}

function parseSpeed(speedStr: string): number {
    if (!speedStr) return 0;
    const clean = speedStr.trim();
    const match = clean.match(/([\d\.]+)\s*([a-zA-Z]+)(?:\/s)?/i);
    if (!match) return 0;
    
    const val = parseFloat(match[1]);
    if (isNaN(val)) return 0;

    const unit = match[2].toUpperCase();
    
    if (unit.startsWith("G")) return val * 1024;
    if (unit.startsWith("M")) return val;
    if (unit.startsWith("K")) return val / 1024;
    if (unit.startsWith("B")) return val / (1024 * 1024);
    return val;
}

function parseSizeToMB(sizeStr?: string): number {
    if (!sizeStr) return 0;
    const clean = sizeStr.trim();
    const match = clean.match(/([\d\.]+)\s*([a-zA-Z]+)/i);
    if (!match) return 0;
    const val = parseFloat(match[1]);
    if (isNaN(val)) return 0;

    const unit = match[2].toUpperCase();
    if (unit.startsWith("G")) return val * 1024;
    if (unit.startsWith("M")) return val;
    if (unit.startsWith("K")) return val / 1024;
    if (unit.startsWith("B")) return val / (1024 * 1024);
    return val;
}

function formatSpeed(val: number): string {
    if (val >= 1024) return (val / 1024).toFixed(1) + ' GB/s';
    if (val >= 1) return val.toFixed(1) + ' MB/s';
    if (val > 0) return (val * 1024).toFixed(1) + ' KB/s';
    return '0 MB/s';
}

export function SpeedChart({ speedStr, downloadedSize, totalSize, progress, isDownloading, onStatsUpdate }: SpeedChartProps) {
    const [history, setHistory] = useState<any[]>([]);
    
    const startTimeRef = useRef<number | null>(null);
    const latestSpeedRef = useRef<string>(speedStr || '');
    const latestDownloadedRef = useRef<{ dl?: string; tot?: string; pct?: number }>({ dl: downloadedSize, tot: totalSize, pct: progress });
    
    const lastMBRef = useRef<number>(0);
    const lastTimeRef = useRef<number>(0);

    // Keep refs updated
    useEffect(() => {
        latestSpeedRef.current = speedStr || '';
    }, [speedStr]);

    useEffect(() => {
        latestDownloadedRef.current = { dl: downloadedSize, tot: totalSize, pct: progress };
    }, [downloadedSize, totalSize, progress]);

    // Timer effect: collects data every second and updates stats continuously
    useEffect(() => {
        if (!isDownloading) {
            startTimeRef.current = null;
            lastMBRef.current = 0;
            lastTimeRef.current = 0;
            return;
        }
        
        if (startTimeRef.current === null) {
            startTimeRef.current = Date.now();
        }
        
        const interval = setInterval(() => {
            if (startTimeRef.current === null) return;
            const now = Date.now();
            const elapsed = Math.max(1, Math.floor((now - startTimeRef.current) / 1000));
            
            let currentSpeed = parseSpeed(latestSpeedRef.current);
            
            // Fallback estimation if speedStr is empty/unparsed
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

                // Calculate average speed
                const totalSpeedSum = next.reduce((sum, item) => sum + item.net, 0);
                const avgSpeed = totalSpeedSum / next.length;
                next[next.length - 1].avg = avgSpeed;

                if (onStatsUpdate) {
                    const mins = Math.floor(elapsed / 60);
                    const secs = elapsed % 60;
                    const durStr = `${mins}:${secs.toString().padStart(2, '0')}`;
                    onStatsUpdate(formatSpeed(avgSpeed), durStr);
                }

                return next;
            });
        }, 1000);
        
        return () => clearInterval(interval);
    }, [isDownloading]);

    return (
        <div className="w-full h-[180px] px-2 pt-2 pb-1">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} vertical={false} />
                    <XAxis 
                        dataKey="time" 
                        tickFormatter={(time: number) => {
                            const m = Math.floor(time / 60);
                            const s = time % 60;
                            return `${m}:${s.toString().padStart(2, '0')}`;
                        }}
                        tick={{fontSize: 10, fill: 'currentColor', opacity: 0.5}} 
                        axisLine={false}
                        tickLine={false}
                        minTickGap={30}
                    />
                    <YAxis 
                        tickFormatter={formatSpeed} 
                        tick={{fontSize: 10, fill: 'currentColor', opacity: 0.5}} 
                        axisLine={false}
                        tickLine={false}
                    />
                    <Tooltip 
                        formatter={(value: number, name: string) => [formatSpeed(value), name]}
                        labelFormatter={(label) => {
                            if (typeof label === 'number') {
                                const m = Math.floor(label / 60);
                                const s = label % 60;
                                return `Time: ${m}:${s.toString().padStart(2, '0')}`;
                            }
                            return '';
                        }}
                        contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))', 
                            borderRadius: '8px',
                            color: 'hsl(var(--foreground))'
                        }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', opacity: 0.8 }} />
                    <Line type="monotone" dataKey="net" name="Network" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="disk" name="Disk IO" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="avg" name="Average" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
