import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { DownloadCloud, Search, ListFilter, XCircle } from "lucide-react";
import { isYouTubeUrl } from "../../utils/formatters";

interface AddUrlCardProps {
    showManualInput: boolean;
    setShowManualInput: (show: boolean) => void;
    manualUrl: string;
    setManualUrl: (url: string) => void;
    manualTitle: string;
    setManualTitle: (title: string) => void;
    onManualDownload: (chosenFormatId?: string) => void;
    onOpenFormatModal: (target: { url: string; title?: string }) => void;
}

export function AddUrlCard({
    showManualInput,
    setShowManualInput,
    manualUrl,
    setManualUrl,
    manualTitle,
    setManualTitle,
    onManualDownload,
    onOpenFormatModal
}: AddUrlCardProps) {
    const handlePasteUrl = async () => {
        try {
            const text = await navigator.clipboard.readText();
            setManualUrl(text);
        } catch (err) {
            console.error('Failed to read clipboard:', err);
        }
    };

    return (
        <Card className="mb-3">
            <CardContent className="p-3">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowManualInput(!showManualInput)}
                        className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2 shrink-0"
                    >
                        <DownloadCloud className="w-4 h-4" />
                        Add URL
                    </button>
                    {showManualInput && (
                        <>
                            <input
                                type="text"
                                placeholder="Paste video URL here..."
                                value={manualUrl}
                                onChange={(e) => setManualUrl(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && onManualDownload()}
                                className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                autoFocus
                            />
                            <input
                                type="text"
                                placeholder="Title (optional)"
                                value={manualTitle}
                                onChange={(e) => setManualTitle(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && onManualDownload()}
                                className="w-48 h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            />
                            <button
                                onClick={handlePasteUrl}
                                className="px-2 py-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors shrink-0"
                                title="Paste from clipboard"
                            >
                                <Search className="w-4 h-4" />
                            </button>

                            {isYouTubeUrl(manualUrl) && (
                                <button
                                    onClick={() => onOpenFormatModal({ url: manualUrl.trim(), title: manualTitle.trim() })}
                                    disabled={!manualUrl.trim()}
                                    className="px-3 py-2 bg-orange-600 text-white rounded-md text-sm font-medium hover:bg-orange-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0"
                                    title="yt-dlp -F format list"
                                >
                                    <ListFilter className="w-4 h-4" />
                                    Format List (-F)
                                </button>
                            )}

                            <button
                                onClick={() => onManualDownload()}
                                disabled={!manualUrl.trim()}
                                className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                            >
                                Download
                            </button>
                            <button
                                onClick={() => {
                                    setShowManualInput(false);
                                    setManualUrl('');
                                    setManualTitle('');
                                }}
                                className="px-2 py-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors shrink-0"
                            >
                                <XCircle className="w-4 h-4" />
                            </button>
                        </>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
