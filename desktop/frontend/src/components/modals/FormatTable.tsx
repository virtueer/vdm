import React from "react";
import { Badge } from "@/components/ui/badge";
import type { YouTubeFormat } from "../../../bindings/vdm/models";
import type { FormatSortField } from "../../types/download";
import { formatBytes } from "../../utils/formatters";

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
    onSort
}: FormatTableProps) {
    const renderSortHeader = (label: string, field: FormatSortField) => {
        const isActive = formatSortField === field;
        return (
            <th 
                onClick={() => onSort(field)}
                className="p-2.5 cursor-pointer hover:bg-muted/70 transition-colors select-none group"
            >
                <div className="flex items-center gap-1">
                    <span>{label}</span>
                    <span className="text-[10px] text-muted-foreground group-hover:text-foreground">
                        {isActive ? (formatSortAsc ? '▲' : '▼') : '↕'}
                    </span>
                </div>
            </th>
        );
    };

    return (
        <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground font-sans">
                    <th className="p-2.5 w-10">Select</th>
                    {renderSortHeader("ID", "formatId")}
                    {renderSortHeader("EXT", "ext")}
                    {renderSortHeader("RESOLUTION", "resolution")}
                    {renderSortHeader("FPS", "fps")}
                    {renderSortHeader("FILESIZE", "filesize")}
                    {renderSortHeader("TBR", "tbr")}
                    {renderSortHeader("VCODEC", "vcodec")}
                    {renderSortHeader("ACODEC", "acodec")}
                    {renderSortHeader("NOTE", "formatNote")}
                </tr>
            </thead>
            <tbody className="divide-y divide-border">
                {formats.map((f) => {
                    const isSelected = selectedFormatId === f.formatId;
                    const isVideoOnly = f.vcodec !== 'none' && f.vcodec !== '' && (f.acodec === 'none' || f.acodec === '');
                    const isAudioOnly = (f.vcodec === 'none' || f.vcodec === '') && f.acodec !== 'none' && f.acodec !== '';

                    return (
                        <tr 
                            key={f.formatId}
                            onClick={() => setSelectedFormatId(f.formatId)}
                            className={`cursor-pointer transition-colors ${isSelected ? 'bg-orange-500/10 dark:bg-orange-500/20 font-semibold' : 'hover:bg-muted/50'}`}
                        >
                            <td className="p-2.5 text-center">
                                <input 
                                    type="radio" 
                                    name="yt_format" 
                                    checked={isSelected}
                                    onChange={() => setSelectedFormatId(f.formatId)}
                                    className="text-orange-500 focus:ring-orange-500"
                                />
                            </td>
                            <td className="p-2.5 font-bold text-orange-600 dark:text-orange-400">{f.formatId}</td>
                            <td className="p-2.5">{f.ext}</td>
                            <td className="p-2.5">
                                {f.resolution}
                                {isVideoOnly && (
                                    <Badge variant="outline" className="ml-1 text-[9px] py-0 px-1 text-blue-500 border-blue-500/30">
                                        {autoAppendAudio ? 'video + audio' : 'video only'}
                                    </Badge>
                                )}
                                {isAudioOnly && <Badge variant="outline" className="ml-1 text-[9px] py-0 px-1 text-green-500 border-green-500/30">audio</Badge>}
                            </td>
                            <td className="p-2.5">{f.fps > 0 ? f.fps : '-'}</td>
                            <td className="p-2.5">{formatBytes(f.filesize)}</td>
                            <td className="p-2.5">{f.tbr > 0 ? `${f.tbr.toFixed(0)}k` : '-'}</td>
                            <td className="p-2.5 text-muted-foreground max-w-[120px] truncate" title={f.vcodec}>{f.vcodec}</td>
                            <td className="p-2.5 text-muted-foreground max-w-[120px] truncate" title={f.acodec}>{f.acodec}</td>
                            <td className="p-2.5 text-muted-foreground">{f.formatNote || '-'}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}
