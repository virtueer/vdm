/** Shared formatters for the compact, mono-typed data cells. */

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

const SPEED_UNITS: Record<string, number> = {
  B: 1,
  KB: 1024,
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
};

/** Parses backend speed strings such as "12.34 MB/s" into bytes per second. */
export function parseSpeed(speed?: string): number {
  if (!speed) return 0;
  const match = speed.match(/([\d.]+)\s*(B|KB|MB|GB)\/s/i);
  if (!match) return 0;
  const value = Number.parseFloat(match[1]);
  const unit = SPEED_UNITS[match[2].toUpperCase()] ?? 1;
  return Number.isNaN(value) ? 0 : value * unit;
}

export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec >= SPEED_UNITS.MB) return `${(bytesPerSec / SPEED_UNITS.MB).toFixed(2)} MB/s`;
  if (bytesPerSec >= SPEED_UNITS.KB) return `${(bytesPerSec / SPEED_UNITS.KB).toFixed(1)} KB/s`;
  return `${Math.round(bytesPerSec)} B/s`;
}

const IS_MAC = /mac/i.test(navigator.userAgent);

/** Platform-aware shortcut label: ⌘K on macOS, Ctrl+K elsewhere. */
export function shortcut(key: string): string {
  return IS_MAC ? `⌘${key}` : `Ctrl+${key}`;
}
