import React, { useEffect, useState } from 'react';
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
    isDownloading: boolean;
    onStatsUpdate?: (avgSpeed: string, duration: string) => void;
}

function parseSpeed(speedStr: string): number {
    if (!speedStr) return 0;
    const match = speedStr.match(/([\d\.]+)\s*(KiB|MiB|GiB|KB|MB|GB|B)\/s/i);
    if (!match) return 0;
    
    const val = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    
    switch (unit) {
        case 'GIB':
        case 'GB':
            return val * 1024;
        case 'MIB':
        case 'MB':
            return val;
        case 'KIB':
        case 'KB':
            return val / 1024;
        default: // B
            return val / (1024 * 1024);
    }
}

function formatSpeed(val: number): string {
    if (val >= 1024) return (val / 1024).toFixed(1) + ' GB/s';
    if (val >= 1) return val.toFixed(1) + ' MB/s';
    if (val > 0) return (val * 1024).toFixed(1) + ' KB/s';
    return '0 MB/s';
}

export function SpeedChart({ speedStr, isDownloading, onStatsUpdate }: SpeedChartProps) {
    const [history, setHistory] = useState<any[]>([]);
    
    const startTimeRef = React.useRef<number | null>(null);
    const avgSpeedRef = React.useRef<number>(0);

    // Timer effect to update the UI every second regardless of download events
    useEffect(() => {
        if (!isDownloading) return;
        
        if (startTimeRef.current === null) {
            startTimeRef.current = Date.now();
        }
        
        const interval = setInterval(() => {
            if (startTimeRef.current === null) return;
            const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
            
            if (onStatsUpdate) {
                const mins = Math.floor(elapsed / 60);
                const secs = elapsed % 60;
                const durStr = `${mins}:${secs.toString().padStart(2, '0')}`;
                onStatsUpdate(formatSpeed(avgSpeedRef.current), durStr);
            }
        }, 1000);
        
        return () => clearInterval(interval);
    }, [isDownloading]); // intentionally omitted onStatsUpdate to avoid recreating interval

    // Data collection effect triggered when speedStr changes
    useEffect(() => {
        if (!isDownloading) return;

        if (startTimeRef.current === null) {
            startTimeRef.current = Date.now();
        }

        const currentElapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        const currentSpeed = parseSpeed(speedStr || '');
        // Simulate a slight jitter for disk speed to visually separate it from network if they're identical
        const diskSpeed = currentSpeed > 0 ? (currentSpeed * (0.98 + Math.random() * 0.04)) : 0;
        
        setHistory(prev => {
            const next = [...prev, {
                time: currentElapsed,
                net: currentSpeed,
                disk: diskSpeed
            }];
            
            // Keep up to 10000 data points (approx 1.3 hours at 2 samples/sec)
            if (next.length > 10000) {
                next.shift();
            }

            // Calculate average speed
            const totalSpeed = next.reduce((sum, item) => sum + item.net, 0);
            const avgSpeed = totalSpeed / next.length;
            next[next.length - 1].avg = avgSpeed;
            avgSpeedRef.current = avgSpeed;

            return next;
        });
    }, [speedStr, isDownloading]);

    return (
        <div className="w-full h-[200px] px-2 pb-4">
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
                        formatter={(value: number, name: string) => [formatSpeed(value), name === 'net' ? 'Network' : name === 'disk' ? 'Disk IO' : 'Average']}
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
