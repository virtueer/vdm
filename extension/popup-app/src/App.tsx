import React, { useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, EyeOff, Download, Check } from "lucide-react";

export interface VideoLink {
  url: string;
  type?: string;
  size?: string;
  bandwidth?: string;
  resolution?: string;
  mimeType?: string;
  timestamp?: number;
  hidden?: boolean;
  pageUrl?: string;
}

export default function App() {
  const [links, setLinks] = useState<VideoLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);

  useEffect(() => {
    // Only run if we are in a chrome extension environment
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab.id) {
          setCurrentTabId(tab.id);
          chrome.runtime.sendMessage(
            { action: 'getVideoLinks', tabId: tab.id },
            (response) => {
              if (response && response.links) {
                setLinks(response.links);
              }
              setLoading(false);
            }
          );
        } else {
          setLoading(false);
        }
      });
    } else {
      // Mock data for local testing
      setLinks([
        { url: "https://example.com/video.mp4", type: "network", size: "50 MB", timestamp: 12345 },
        { url: "https://example.com/audio.mp3", type: "network", size: "5 MB", timestamp: 12346 },
        { url: "https://example.com/hidden.mp4", type: "network", size: "10 MB", timestamp: 12347, hidden: true }
      ]);
      setLoading(false);
    }
  }, []);

  const handleAction = (actionName: string, url: string) => {
    if (typeof chrome !== 'undefined' && chrome.tabs && currentTabId) {
      chrome.runtime.sendMessage(
        { action: actionName, tabId: currentTabId, url: url },
        () => {
          // Update local state instantly
          setLinks(prev => prev.map(link => 
            link.url === url ? { ...link, hidden: actionName === 'hideVideoLink' } : link
          ));
        }
      );
    }
  };

  return (
    <div className="w-full flex flex-col h-[500px] bg-background">
      <div className="flex items-center px-4 py-3 bg-primary text-primary-foreground shadow-sm">
        <h2 className="text-sm font-semibold m-0 tracking-tight">Virtueer Media Grabber</h2>
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
            {links.map((video, idx) => (
              video.hidden ? (
                <div key={idx} className="flex items-center justify-between p-3 rounded-lg border border-dashed bg-muted/50 transition-opacity">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <EyeOff className="w-4 h-4" />
                    <span className="text-xs italic">Hidden Link</span>
                  </div>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleAction('showVideoLink', video.url)}>
                    Restore
                  </Button>
                </div>
              ) : (
                <MediaCard key={idx} video={video} onHide={() => handleAction('hideVideoLink', video.url)} />
              )
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function MediaCard({ video, onHide }: { video: VideoLink; onHide: () => void }) {
  const [copied, setCopied] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState("Download");
  const [resolution, setResolution] = useState<string | null>(video.resolution || null);

  const urlString = video.url.length > 70 ? video.url.substring(0, 70) + '...' : video.url;
  
  const isAudio = (video.mimeType && video.mimeType.startsWith('audio/')) || 
                  /\.(mp3|wav|m4a|aac|ogg|flac|mka)$/i.test(video.url) ||
                  /_aud(\d+)?\.(txt|m3u8)$/i.test(video.url) ||
                  /audio/i.test(video.url.split('/').pop() || "");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(video.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDownload = async () => {
    try {
      setDownloadStatus("Sending...");
      const res = await fetch('http://localhost:9614/api/download', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json'
          },
          body: JSON.stringify({
              url: video.url,
              type: video.type || 'network',
              size: video.size || 'Unknown',
              pageUrl: video.pageUrl || ''
          })
      });

      if (res.ok) {
          setDownloadStatus("Sent!");
          setTimeout(() => setDownloadStatus("Download"), 1500);
      } else {
          throw new Error("Server error");
      }
    } catch (err) {
        console.error('Failed to send to app: ', err);
        setDownloadStatus("Failed");
        setTimeout(() => setDownloadStatus("Download"), 1500);
        alert('VDM Desktop application is not running or unreachable.');
    }
  };

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const target = e.target as HTMLVideoElement;
    if (target.videoWidth && target.videoHeight) {
      setResolution(`${target.videoWidth}x${target.videoHeight}`);
    }
  };

  const isM3u8 = video.url.includes('.m3u8') || video.url.includes('master.txt');
  const srcHash = isM3u8 ? '' : '#t=0.001';

  return (
    <Card className="overflow-hidden shadow-sm transition-all hover:shadow-md">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="text-xs font-medium text-foreground break-all leading-tight flex-1 line-clamp-2" title={video.url}>
            {urlString}
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 rounded-full" onClick={handleCopy} title="Copy URL">
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />}
          </Button>
        </div>
        
        <div className="text-[10px] text-muted-foreground flex flex-wrap gap-x-2 gap-y-1 mb-3">
          <span className="bg-secondary px-1.5 py-0.5 rounded text-secondary-foreground">{video.type}</span>
          <span className="flex items-center">
            {video.size?.startsWith('~') ? video.size : (video.bandwidth ? `${video.bandwidth} (Stream)` : video.size)}
          </span>
          {resolution && <span className="flex items-center text-primary/70">{resolution}</span>}
        </div>

        <div className="mb-3 rounded-md overflow-hidden bg-black/5 flex items-center justify-center">
          {isAudio ? (
            <audio src={video.url} controls className="w-full h-10 outline-none" />
          ) : (
            <video 
              src={`${video.url}${srcHash}`} 
              preload="metadata" 
              controls 
              onLoadedMetadata={handleLoadedMetadata}
              className="w-full max-h-[160px] object-contain bg-black" 
            />
          )}
        </div>

        <div className="flex gap-2">
          <Button onClick={handleDownload} className="flex-1 h-8 text-xs font-medium shadow-sm transition-all" variant={downloadStatus === 'Sent!' ? 'secondary' : 'default'}>
            {downloadStatus === 'Sent!' ? <Check className="w-3.5 h-3.5 mr-1.5 text-green-500" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
            {downloadStatus}
          </Button>
          <Button onClick={onHide} variant="outline" className="h-8 text-xs hover:bg-destructive/5 hover:text-destructive hover:border-destructive/30 transition-colors">
            <EyeOff className="w-3.5 h-3.5 mr-1.5" />
            Hide
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
