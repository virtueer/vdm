import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { YouTubeFormat } from '../../../bindings/vdm/models';
import type { FormatSortField } from '../../types/download';
import { formatBytes } from '../../utils/formatters';

interface FormatTableProps {
  formats: YouTubeFormat[];
  selectedFormatId: string | null;
  setSelectedFormatId: (id: string) => void;
  autoAppendAudio: boolean;
  formatSortField: FormatSortField | null;
  formatSortAsc: boolean;
  onSort: (field: FormatSortField) => void;
}

export function FormatTable({
  formats,
  selectedFormatId,
  setSelectedFormatId,
  autoAppendAudio,
  formatSortField,
  formatSortAsc,
  onSort,
}: FormatTableProps) {
  const renderSortHeader = (label: string, field: FormatSortField) => {
    const isActive = formatSortField === field;
    return (
      <TableHead
        onClick={() => onSort(field)}
        className="cursor-pointer hover:bg-muted/70 transition-colors select-none group"
      >
        <div className="flex items-center gap-1">
          <span>{label}</span>
          <span className="text-[10px] text-muted-foreground group-hover:text-foreground">
            {isActive ? (formatSortAsc ? '▲' : '▼') : '↕'}
          </span>
        </div>
      </TableHead>
    );
  };

  return (
    <Table className="text-xs font-mono">
      <TableHeader className="bg-muted/40 font-sans">
        <TableRow>
          <TableHead className="w-10 text-center">Select</TableHead>
          {renderSortHeader('ID', 'formatId')}
          {renderSortHeader('EXT', 'ext')}
          {renderSortHeader('RESOLUTION', 'resolution')}
          {renderSortHeader('FPS', 'fps')}
          {renderSortHeader('FILESIZE', 'filesize')}
          {renderSortHeader('TBR', 'tbr')}
          {renderSortHeader('VCODEC', 'vcodec')}
          {renderSortHeader('ACODEC', 'acodec')}
          {renderSortHeader('NOTE', 'formatNote')}
        </TableRow>
      </TableHeader>
      <TableBody>
        {formats.map((f) => {
          const isSelected = selectedFormatId === f.formatId;
          const isVideoOnly =
            f.vcodec !== 'none' && f.vcodec !== '' && (f.acodec === 'none' || f.acodec === '');
          const isAudioOnly =
            (f.vcodec === 'none' || f.vcodec === '') && f.acodec !== 'none' && f.acodec !== '';

          return (
            <TableRow
              key={f.formatId}
              onClick={() => setSelectedFormatId(f.formatId)}
              className={`cursor-pointer ${isSelected ? 'bg-orange-500/10 dark:bg-orange-500/20 font-semibold' : ''}`}
            >
              <TableCell className="text-center">
                <input
                  type="radio"
                  name="yt_format"
                  checked={isSelected}
                  onChange={() => setSelectedFormatId(f.formatId)}
                  className="text-orange-500 focus:ring-orange-500"
                />
              </TableCell>
              <TableCell className="font-bold text-orange-600 dark:text-orange-400">
                {f.formatId}
              </TableCell>
              <TableCell>{f.ext}</TableCell>
              <TableCell>
                {f.resolution}
                {isVideoOnly && (
                  <Badge
                    variant="outline"
                    className="ml-1 text-[9px] py-0 px-1 text-blue-500 border-blue-500/30"
                  >
                    {autoAppendAudio ? 'video + audio' : 'video only'}
                  </Badge>
                )}
                {isAudioOnly && (
                  <Badge
                    variant="outline"
                    className="ml-1 text-[9px] py-0 px-1 text-green-500 border-green-500/30"
                  >
                    audio
                  </Badge>
                )}
              </TableCell>
              <TableCell>{f.fps > 0 ? f.fps : '-'}</TableCell>
              <TableCell>{formatBytes(f.filesize)}</TableCell>
              <TableCell>{f.tbr > 0 ? `${f.tbr.toFixed(0)}k` : '-'}</TableCell>
              <TableCell className="text-muted-foreground max-w-[120px] truncate" title={f.vcodec}>
                {f.vcodec}
              </TableCell>
              <TableCell className="text-muted-foreground max-w-[120px] truncate" title={f.acodec}>
                {f.acodec}
              </TableCell>
              <TableCell className="text-muted-foreground">{f.formatNote || '-'}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
