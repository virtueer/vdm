import React from 'react';
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
import { formatChartSpeed } from '../utils/chartUtils';
import { useChartHistory } from '../hooks/useChartHistory';

interface SpeedChartProps {
    speedStr?: string;
    downloadedSize?: string;
    totalSize?: string;
    progress?: number;
    isDownloading: boolean;
    onStatsUpdate?: (avgSpeed: string, duration: string) => void;
}

export function SpeedChart(props: SpeedChartProps) {
    const history = useChartHistory(props);

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
                        tickFormatter={formatChartSpeed} 
                        tick={{fontSize: 10, fill: 'currentColor', opacity: 0.5}} 
                        axisLine={false}
                        tickLine={false}
                    />
                    <Tooltip 
                        formatter={(value: number, name: string) => [formatChartSpeed(value), name]}
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
