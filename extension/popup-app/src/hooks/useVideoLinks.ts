import { useCallback, useEffect, useState } from 'react';
import { isExtension, queryActiveTab, sendMessage } from '@/lib/chrome';
import { hostOf } from '@/lib/title';
import type { VideoLink } from '@/types';

/** Shown when the popup runs outside the extension (vite dev, standalone tab). */
const DEV_LINKS: VideoLink[] = [
  { url: 'https://example.com/video.mp4', type: 'network', size: '50 MB', timestamp: 12345 },
  { url: 'https://example.com/audio.mp3', type: 'network', size: '5 MB', timestamp: 12346 },
  {
    url: 'https://example.com/hidden.mp4',
    type: 'network',
    size: '10 MB',
    timestamp: 12347,
    hidden: true,
  },
];

export interface VideoLinksState {
  links: VideoLink[];
  loading: boolean;
  pageHost: string;
  autoIntercept: boolean;
  toggleAutoIntercept: () => void;
  setHidden: (url: string, hidden: boolean) => void;
}

/** Owns everything the popup reads from the background service worker. */
export function useVideoLinks(): VideoLinksState {
  const [links, setLinks] = useState<VideoLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabId, setTabId] = useState<number | null>(null);
  const [pageHost, setPageHost] = useState('');
  const [autoIntercept, setAutoIntercept] = useState(true);

  useEffect(() => {
    if (!isExtension) {
      setLinks(DEV_LINKS);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      const settings = await sendMessage<{ autoIntercept?: boolean }>({
        action: 'getAutoIntercept',
      });
      if (!cancelled && settings?.autoIntercept !== undefined) {
        setAutoIntercept(settings.autoIntercept);
      }

      const tab = await queryActiveTab();
      if (cancelled) return;
      setPageHost(hostOf(tab?.url));

      if (!tab?.id) {
        setLoading(false);
        return;
      }
      setTabId(tab.id);

      const response = await sendMessage<{ links?: VideoLink[] }>({
        action: 'getVideoLinks',
        tabId: tab.id,
      });
      if (cancelled) return;
      if (response?.links) setLinks(response.links);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const setHidden = useCallback(
    (url: string, hidden: boolean) => {
      if (!tabId) return;
      const action = hidden ? 'hideVideoLink' : 'showVideoLink';
      // Reflect the change immediately; the worker only persists it.
      setLinks((prev) => prev.map((link) => (link.url === url ? { ...link, hidden } : link)));
      sendMessage({ action, tabId, url });
    },
    [tabId]
  );

  const toggleAutoIntercept = useCallback(async () => {
    const response = await sendMessage<{ success?: boolean; autoIntercept?: boolean }>({
      action: 'toggleAutoIntercept',
    });
    if (response?.success && response.autoIntercept !== undefined) {
      setAutoIntercept(response.autoIntercept);
    }
  }, []);

  return { links, loading, pageHost, autoIntercept, toggleAutoIntercept, setHidden };
}
