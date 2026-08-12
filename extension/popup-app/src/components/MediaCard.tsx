import type React from 'react';
import { useState } from 'react';
import { Check, Copy, Download, EyeOff, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { VideoLink } from '../types';

export function YoutubeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

export function getYouTubeId(url: string): string | null {
  if (!url) return null;
  if (url.includes('v=')) {
    const match = url.match(/[?&]v=([^&]+)/);
    if (match) return match[1];
  }
  if (url.includes('/shorts/')) {
    const match = url.match(/\/shorts\/([^?/]+)/);
    if (match) return match[1];
  }
  if (url.includes('youtu.be/')) {
    const match = url.match(/youtu\.be\/([^?/]+)/);
    if (match) return match[1];
  }
  return null;
}

export function MediaCard({ video, onHide }: { video: VideoLink; onHide: () => void }) {
  const [copied, setCopied] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState('Download');
  const [resolution, setResolution] = useState<string | null>(video.resolution || null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const urlString = video.url.length > 70 ? `${video.url.substring(0, 70)}...` : video.url;
  const isYouTube =
    video.type === 'youtube' || video.url.includes('youtube.com') || video.url.includes('youtu.be');
  const ytVideoId = isYouTube ? getYouTubeId(video.url) : null;
  const displayTitle = video.title || urlString;

  const isAudio =
    !isYouTube &&
    (video.mimeType?.startsWith('audio/') ||
      /\.(mp3|wav|m4a|aac|ogg|flac|mka)$/i.test(video.url) ||
      /_aud(\d+)?\.(txt|m3u8)$/i.test(video.url) ||
      /audio/i.test(video.url.split('/').pop() || ''));

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
      setDownloadStatus('Sending...');
      const res = await fetch('http://localhost:9614/api/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: video.url,
          type: video.type || 'network',
          size: video.size || 'Unknown',
          pageUrl: video.pageUrl || video.url,
          title: video.title || '',
        }),
      });

      if (res.ok) {
        setDownloadStatus('Sent!');
        setTimeout(() => setDownloadStatus('Download'), 1500);
      } else {
        throw new Error('Server error');
      }
    } catch (err) {
      console.error('Failed to send to app: ', err);
      setDownloadStatus('Failed');
      setTimeout(() => setDownloadStatus('Download'), 1500);
      alert('Video Download Manager desktop app is not running or unreachable.');
    }
  };

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const target = e.target as HTMLVideoElement;
    if (target.videoWidth && target.videoHeight) {
      setResolution(`${target.videoWidth}x${target.videoHeight}`);
    }
  };

  const handleTestTitle = () => {
    setTestResult('Testing...');
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab?.id) {
          const runFallback = (pageTitle: string) => {
            if (
              !pageTitle ||
              pageTitle.trim() === '' ||
              pageTitle.toLowerCase() === 'video' ||
              pageTitle === 'Player'
            ) {
              try {
                const u = new URL(video.pageUrl || tab.url || '');
                const path = u.pathname.replace(/^\/+|\/+$/g, '');
                if (path) {
                  const parts = path.split('/');
                  if (parts.length > 1) {
                    pageTitle = parts.slice(-2).join('-');
                  } else {
                    pageTitle = parts[parts.length - 1];
                  }
                } else {
                  pageTitle = u.hostname;
                }
              } catch (_err) {
                pageTitle = 'Video';
              }
            }
            setTestResult(`Result: ${pageTitle}`);
          };

          chrome.tabs.sendMessage(tab.id, { action: 'getPageTitle' }, { frameId: 0 }, (res) => {
            let title = '';
            if (!chrome.runtime.lastError && res && res.title) {
              title = res.title;
            }
            if (title && title.toLowerCase() !== 'video' && title !== 'Player') {
              runFallback(title);
            } else {
              chrome.tabs.get(tab.id!, (t) => {
                runFallback(t ? t.title || '' : '');
              });
            }
          });
        }
      });
    } else {
      setTestResult('Test title works only in extension.');
    }
  };

  const isM3u8 = video.url.includes('.m3u8') || video.url.includes('master.txt');
  const srcHash = isM3u8 ? '' : '#t=0.001';

  return (
    <Card className="overflow-hidden shadow-sm transition-all hover:shadow-md">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div
            className="text-xs font-semibold text-foreground break-words leading-tight flex-1 line-clamp-2"
            title={video.title || video.url}
          >
            {displayTitle}
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 rounded-full"
              onClick={handleTestTitle}
              title="Test Title Extraction"
            >
              <Search className="h-3.5 w-3.5 text-muted-foreground hover:text-orange-500" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 rounded-full"
              onClick={handleCopy}
              title="Copy URL"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              )}
            </Button>
          </div>
        </div>

        {testResult && (
          <div className="text-[11px] font-bold text-green-600 mb-2 break-all bg-green-500/10 p-1.5 rounded-md">
            {testResult}
          </div>
        )}

        <div className="text-[10px] text-muted-foreground flex flex-wrap gap-x-2 gap-y-1 mb-3">
          <span className="bg-secondary px-1.5 py-0.5 rounded text-secondary-foreground">
            {video.type}
          </span>
          <span className="flex items-center">
            {video.size?.startsWith('~')
              ? video.size
              : video.bandwidth
                ? `${video.bandwidth} (Stream)`
                : video.size}
          </span>
          {resolution && <span className="flex items-center text-primary/70">{resolution}</span>}
        </div>

        <div className="mb-3 rounded-md overflow-hidden bg-black/5 flex items-center justify-center">
          {isYouTube ? (
            <div className="relative w-full h-[140px] bg-black flex items-center justify-center group overflow-hidden">
              {ytVideoId ? (
                <img
                  src={`https://img.youtube.com/vi/${ytVideoId}/hqdefault.jpg`}
                  alt={video.title || 'YouTube Video'}
                  className="w-full h-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : null}
              <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-1">
                <YoutubeIcon className="w-10 h-10 text-red-600 drop-shadow-md" />
                <span className="text-[11px] text-white/90 font-medium px-2 py-0.5 bg-black/60 rounded">
                  YouTube Video (yt-dlp)
                </span>
              </div>
            </div>
          ) : isAudio ? (
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
          <Button
            onClick={handleDownload}
            className="flex-1 h-8 text-xs font-medium shadow-sm transition-all"
            variant={downloadStatus === 'Sent!' ? 'secondary' : 'default'}
          >
            {downloadStatus === 'Sent!' ? (
              <Check className="w-3.5 h-3.5 mr-1.5 text-green-500" />
            ) : (
              <Download className="w-3.5 h-3.5 mr-1.5" />
            )}
            {downloadStatus}
          </Button>
          <Button
            onClick={onHide}
            variant="outline"
            className="h-8 text-xs hover:bg-destructive/5 hover:text-destructive hover:border-destructive/30 transition-colors"
          >
            <EyeOff className="w-3.5 h-3.5 mr-1.5" />
            Hide
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
