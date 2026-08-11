export function parseSpeed(speedStr: string): number {
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

export function parseSizeToMB(sizeStr?: string): number {
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

export function formatChartSpeed(val: number): string {
    if (val >= 1024) return (val / 1024).toFixed(1) + ' GB/s';
    if (val >= 1) return val.toFixed(1) + ' MB/s';
    if (val > 0) return (val * 1024).toFixed(1) + ' KB/s';
    return '0 MB/s';
}
