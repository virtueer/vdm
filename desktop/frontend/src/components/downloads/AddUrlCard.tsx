import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
                    <Button
                        onClick={() => setShowManualInput(!showManualInput)}
                        className="gap-2 shrink-0"
                    >
                        <DownloadCloud className="w-4 h-4" />
                        Add URL
                    </Button>
                    {showManualInput && (
                        <>
                            <Input
                                type="text"
                                placeholder="Paste video URL here..."
                                value={manualUrl}
                                onChange={(e) => setManualUrl(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && onManualDownload()}
                                className="flex-1"
                                autoFocus
                            />
                            <Input
                                type="text"
                                placeholder="Title (optional)"
                                value={manualTitle}
                                onChange={(e) => setManualTitle(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && onManualDownload()}
                                className="w-48"
                            />
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handlePasteUrl}
                                title="Paste from clipboard"
                            >
                                <Search className="w-4 h-4" />
                            </Button>

                            {isYouTubeUrl(manualUrl) && (
                                <Button
                                    variant="default"
                                    onClick={() => onOpenFormatModal({ url: manualUrl.trim(), title: manualTitle.trim() })}
                                    disabled={!manualUrl.trim()}
                                    className="bg-orange-600 hover:bg-orange-500 text-white gap-1.5 shrink-0"
                                    title="yt-dlp -F format list"
                                >
                                    <ListFilter className="w-4 h-4" />
                                    Format List (-F)
                                </Button>
                            )}

                            <Button
                                onClick={() => onManualDownload()}
                                disabled={!manualUrl.trim()}
                                className="shrink-0"
                            >
                                Download
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                    setShowManualInput(false);
                                    setManualUrl('');
                                    setManualTitle('');
                                }}
                            >
                                <XCircle className="w-4 h-4" />
                            </Button>
                        </>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
