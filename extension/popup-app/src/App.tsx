import { EyeOff, Settings, ToggleLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { VideoLink } from './types';
import { MediaCard } from './components/MediaCard';

export default function App() {
  const [links, setLinks] = useState<VideoLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);
  const [autoIntercept, setAutoIntercept] = useState(true);

  useEffect(() => {
    // Only run if we are in a chrome extension environment
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      // Get auto-intercept setting
      chrome.runtime.sendMessage({ action: 'getAutoIntercept' }, (response) => {
        if (response && response.autoIntercept !== undefined) {
          setAutoIntercept(response.autoIntercept);
        }
      });

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab.id) {
          setCurrentTabId(tab.id);
          chrome.runtime.sendMessage({ action: 'getVideoLinks', tabId: tab.id }, (response) => {
            if (response?.links) {
              setLinks(response.links);
            }
            setLoading(false);
          });
        } else {
          setLoading(false);
        }
      });
    } else {
      // Mock data for local testing
      setLinks([
        { url: 'https://example.com/video.mp4', type: 'network', size: '50 MB', timestamp: 12345 },
        { url: 'https://example.com/audio.mp3', type: 'network', size: '5 MB', timestamp: 12346 },
        {
          url: 'https://example.com/hidden.mp4',
          type: 'network',
          size: '10 MB',
          timestamp: 12347,
          hidden: true,
        },
      ]);
      setLoading(false);
    }
  }, []);

  const handleAction = (actionName: string, url: string) => {
    if (typeof chrome !== 'undefined' && chrome.tabs && currentTabId) {
      chrome.runtime.sendMessage({ action: actionName, tabId: currentTabId, url: url }, () => {
        // Update local state instantly
        setLinks((prev) =>
          prev.map((link) =>
            link.url === url ? { ...link, hidden: actionName === 'hideVideoLink' } : link
          )
        );
      });
    }
  };

  const toggleAutoIntercept = () => {
    if (typeof chrome !== 'undefined') {
      chrome.runtime.sendMessage({ action: 'toggleAutoIntercept' }, (response) => {
        if (response?.success) {
          setAutoIntercept(response.autoIntercept);
        }
      });
    }
  };

  return (
    <div className="w-full flex flex-col h-[500px] bg-background">
      <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground shadow-sm">
        <h2 className="text-sm font-semibold m-0 tracking-tight">Video Download Manager</h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-primary-foreground hover:bg-primary/80"
          onClick={toggleAutoIntercept}
          title={autoIntercept ? 'Auto-intercept is ON' : 'Auto-intercept is OFF'}
        >
          {autoIntercept ? <ToggleLeft className="h-4 w-4" /> : <Settings className="h-4 w-4" />}
        </Button>
      </div>

      <div className="px-4 py-2 bg-muted/50 border-b">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Auto-intercept downloads:</span>
          <span className={`font-medium ${autoIntercept ? 'text-green-600' : 'text-red-600'}`}>
            {autoIntercept ? 'ON' : 'OFF'}
          </span>
        </div>
      </div>

      <ScrollArea className="flex-1 p-3">
        {loading ? (
          <div className="flex items-center justify-center p-8 text-muted-foreground text-sm">
            Scanning for media...
          </div>
        ) : links.length === 0 ? (
          <div className="flex items-center justify-center p-8 text-muted-foreground text-sm">
            No media found on this page.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {links.map((video, idx) =>
              video.hidden ? (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-lg border border-dashed bg-muted/50 transition-opacity"
                >
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <EyeOff className="w-4 h-4" />
                    <span className="text-xs italic">Hidden Link</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleAction('showVideoLink', video.url)}
                  >
                    Restore
                  </Button>
                </div>
              ) : (
                <MediaCard
                  key={idx}
                  video={video}
                  onHide={() => handleAction('hideVideoLink', video.url)}
                />
              )
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
