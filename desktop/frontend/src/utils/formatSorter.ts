import type { YouTubeFormat } from '../../bindings/vdm/models';
import type { FormatSortField } from '../types/download';

export function sortFormats(
  formatsList: YouTubeFormat[],
  formatCategory: 'all' | 'combined' | 'video' | 'audio',
  formatSortField: FormatSortField | null,
  formatSortAsc: boolean
): YouTubeFormat[] {
  const filtered = formatsList.filter((f) => {
    const isVideo = f.vcodec !== 'none' && f.vcodec !== '';
    const isAudio = f.acodec !== 'none' && f.acodec !== '';
    if (formatCategory === 'combined') return isVideo && isAudio;
    if (formatCategory === 'video') return isVideo && !isAudio;
    if (formatCategory === 'audio') return isAudio && !isVideo;
    return true;
  });

  return [...filtered].sort((a, b) => {
    if (!formatSortField) return 0;
    let valA: any = a[formatSortField];
    let valB: any = b[formatSortField];

    if (formatSortField === 'resolution') {
      const parseRes = (r: string) => {
        if (!r) return 0;
        const match = r.match(/(\d+)x(\d+)/) || r.match(/(\d+)p/) || r.match(/(\d+)/);
        return match ? parseInt(match[match.length - 1], 10) : 0;
      };
      valA = parseRes(a.resolution);
      valB = parseRes(b.resolution);
    } else if (formatSortField === 'formatId') {
      const intA = parseInt(a.formatId, 10);
      const intB = parseInt(b.formatId, 10);
      if (!Number.isNaN(intA) && !Number.isNaN(intB)) {
        valA = intA;
        valB = intB;
      }
    }

    if (valA === undefined || valA === null) return 1;
    if (valB === undefined || valB === null) return -1;
    if (typeof valA === 'number' && typeof valB === 'number') {
      return formatSortAsc ? valA - valB : valB - valA;
    }
    return formatSortAsc
      ? String(valA).localeCompare(String(valB))
      : String(valB).localeCompare(String(valA));
  });
}
