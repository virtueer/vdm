import { useEffect, useState } from "react";
import { GetYouTubeFormats } from "../../bindings/vdm/app";
import type { YouTubeFormat } from "../../bindings/vdm/models";

export function useYouTubeFormatsFetcher(url: string) {
    const [formatLoading, setFormatLoading] = useState(true);
    const [formatError, setFormatError] = useState<string | null>(null);
    const [formatsList, setFormatsList] = useState<YouTubeFormat[]>([]);

    useEffect(() => {
        setFormatLoading(true);
        setFormatError(null);
        setFormatsList([]);

        GetYouTubeFormats(url)
            .then(res => {
                if (Array.isArray(res)) setFormatsList(res);
                else setFormatError("No formats found.");
            })
            .catch(err => {
                console.error("Format fetch error:", err);
                setFormatError("yt-dlp format fetch failed: " + (err?.message || err));
            })
            .finally(() => setFormatLoading(false));
    }, [url]);

    return { formatLoading, formatError, formatsList };
}
