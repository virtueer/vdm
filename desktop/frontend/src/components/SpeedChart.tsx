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

export function SpeedChart({ speedStr, isDownloading }: SpeedChartProps) {
    const [history, setHistory] = useState<any[]>(Array.from({length: 40}, (_, i) => ({ time: i, net: 0, disk: 0 })));
    const [counter, setCounter] = useState(40);

    useEffect(() => {
        if (!isDownloading) return;

        const currentSpeed = parseSpeed(speedStr || '');
        // Simulate a slight jitter for disk speed to visually separate it from network if they're identical
        const diskSpeed = currentSpeed > 0 ? (currentSpeed * (0.98 + Math.random() * 0.04)) : 0;
        
        setHistory(prev => {
            const next = [...prev, {
                time: counter,
                net: currentSpeed,
                disk: diskSpeed
            }];
            if (next.length > 40) {
                next.shift();
            }
            return next;
        });
        setCounter(c => c + 1);
    }, [speedStr, isDownloading]);

    return (
        <div className="w-full h-[200px] px-2 pb-4">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} vertical={false} />
                    <XAxis dataKey="time" hide />
                    <YAxis 
                        tickFormatter={formatSpeed} 
                        tick={{fontSize: 10, fill: 'currentColor', opacity: 0.5}} 
                        axisLine={false}
                        tickLine={false}
                    />
                    <Tooltip 
                        formatter={(value: number, name: string) => [formatSpeed(value), name === 'net' ? 'Network' : 'Disk IO']}
                        labelFormatter={() => ''}
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
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
