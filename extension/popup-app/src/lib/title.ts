const PLACEHOLDER_TITLES = ['', 'video', 'player'];

export function isPlaceholderTitle(title: string): boolean {
  return PLACEHOLDER_TITLES.includes(title.trim().toLowerCase());
}

/** Falls back to the last path segments, then the hostname, when a page has no usable title. */
export function derivePageTitle(rawTitle: string, url: string): string {
  if (!isPlaceholderTitle(rawTitle)) return rawTitle;

  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\/+|\/+$/g, '');
    if (!path) return parsed.hostname;
    const parts = path.split('/');
    return parts.length > 1 ? parts.slice(-2).join('-') : parts[0];
  } catch (_err) {
    return 'Video';
  }
}

export function hostOf(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (_err) {
    return '';
  }
}
