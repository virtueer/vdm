import { Check, Copy, Download, ExternalLink, EyeOff, Search } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { sendToBridge } from '@/lib/bridge';
import {
  getTab,
  isExtension,
  openTab,
  queryActiveTab,
  sendMessage,
  sendTabMessage,
} from '@/lib/chrome';
import { isAudioLink, isYouTubeLink } from '@/lib/media';
import { derivePageTitle, isPlaceholderTitle } from '@/lib/title';
import { cn } from '@/lib/utils';
import type { VideoLink } from '@/types';

export function YoutubeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

export function ChromeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
      <line x1="21.17" y1="8" x2="12" y2="8" />
      <line x1="3.95" y1="6.06" x2="8.54" y2="14" />
      <line x1="10.88" y1="21.94" x2="15.46" y2="14" />
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

function getSuggestedFilename(video: VideoLink, isAudio: boolean): string | undefined {
  if (!video.title && !video.url) return undefined;

  // biome-ignore lint/suspicious/noControlCharactersInRegex: filesystem-illegal control chars must be stripped
  let baseName = (video.title || '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();

  // Check if baseName already has a standard file extension
  const hasExt = /\.[a-z0-9]{2,5}$/i.test(baseName);
  if (!hasExt) {
    let ext = '';
    try {
      const u = new URL(video.url);
      const pathname = u.pathname;
      const match = pathname.match(/\.([a-z0-9]{2,5})$/i);
      if (match) {
        ext = match[0];
      }
    } catch (_) {}

    if (!ext && video.mimeType) {
      if (video.mimeType.includes('mp4')) ext = '.mp4';
      else if (video.mimeType.includes('webm')) ext = '.webm';
      else if (video.mimeType.includes('mp3') || video.mimeType.includes('mpeg')) ext = '.mp3';
      else if (video.mimeType.includes('wav')) ext = '.wav';
      else if (video.mimeType.includes('ogg')) ext = '.ogg';
      else if (video.mimeType.includes('aac')) ext = '.aac';
      else if (video.mimeType.includes('m4a')) ext = '.m4a';
      else if (video.mimeType.includes('flv')) ext = '.flv';
      else if (video.mimeType.includes('x-matroska') || video.mimeType.includes('mkv'))
        ext = '.mkv';
    }

    if (!ext) {
      ext = isAudio || video.type === 'audio' ? '.mp3' : '.mp4';
    }

    if (baseName) {
      baseName = `${baseName}${ext}`;
    }
  }

  return baseName || undefined;
}

const previewFrame = 'relative overflow-hidden rounded-md border border-border/60 bg-muted';

export function MediaCard({ video, onHide }: { video: VideoLink; onHide: () => void }) {
  const [copied, setCopied] = useState(false);
  const [vdmStatus, setVdmStatus] = useState('VDM App');
  const [chromeStatus, setChromeStatus] = useState('Chrome');
  const [resolution, setResolution] = useState<string | null>(video.resolution || null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const isYouTube = isYouTubeLink(video);
  const isAudio = isAudioLink(video);
  const ytVideoId = isYouTube ? getYouTubeId(video.url) : null;
  const displayTitle = video.title || video.url;

  const sizeLabel = video.size?.startsWith('~')
    ? video.size
    : video.bandwidth
      ? `${video.bandwidth} (Stream)`
      : video.size;

  const handleOpenInNewTab = () => openTab(video.url);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(video.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDownloadVDM = async () => {
    setVdmStatus('Sending...');
    const ok = await sendToBridge({
      url: video.url,
      type: video.type || 'network',
      size: video.size || 'Unknown',
      pageUrl: video.pageUrl || video.url,
      title: video.title || '',
    });

    if (ok) {
      setVdmStatus('Sent!');
      setTimeout(() => setVdmStatus('VDM App'), 1500);
      return;
    }

    setVdmStatus('Failed');
    setTimeout(() => setVdmStatus('VDM App'), 1500);
    alert('Video Download Manager desktop app is not running or unreachable.');
  };

  const handleDownloadChrome = async () => {
    if (isYouTube) return;

    setChromeStatus('Starting...');
    const filename = getSuggestedFilename(video, isAudio);

    if (!isExtension) {
      console.log('Download with Chrome triggered locally:', { url: video.url, filename });
      setChromeStatus('Started!');
      setTimeout(() => setChromeStatus('Chrome'), 1500);
      return;
    }

    const response = await sendMessage<{ success?: boolean; error?: string }>({
      action: 'downloadWithChrome',
      url: video.url,
      filename,
    });

    if (response?.success) {
      setChromeStatus('Started!');
      setTimeout(() => setChromeStatus('Chrome'), 1500);
      return;
    }

    console.error('Chrome download failed:', response?.error);
    setChromeStatus('Failed');
    setTimeout(() => setChromeStatus('Chrome'), 1500);
    alert(response?.error || 'Failed to start download in Chrome.');
  };

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const target = e.target as HTMLVideoElement;
    if (target.videoWidth && target.videoHeight) {
      setResolution(`${target.videoWidth}x${target.videoHeight}`);
    }
  };

  const handleTestTitle = async () => {
    setTestResult('Testing...');

    if (!isExtension) {
      setTestResult('Test title works only in extension.');
      return;
    }

    const tab = await queryActiveTab();
    if (!tab?.id) return;

    // The content script answers from the top frame; fall back to the tab title.
    const framed = await sendTabMessage<{ title?: string }>(
      tab.id,
      { action: 'getPageTitle' },
      { frameId: 0 }
    );
    const fromFrame = framed?.title ?? '';
    const rawTitle = isPlaceholderTitle(fromFrame)
      ? ((await getTab(tab.id))?.title ?? '')
      : fromFrame;

    setTestResult(`Result: ${derivePageTitle(rawTitle, video.pageUrl || tab.url || '')}`);
  };

  const isM3u8 = video.url.includes('.m3u8') || video.url.includes('master.txt');
  const srcHash = isM3u8 ? '' : '#t=0.001';

  return (
    <Card className="flex flex-col gap-2.5 p-3">
      <div className="flex items-start gap-2">
        <p
          className="line-clamp-2 min-w-0 flex-1 break-all text-xs font-medium leading-tight"
          title={video.title || video.url}
        >
          {displayTitle}
        </p>

        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleOpenInNewTab}
            title="Yeni sekmede aç (tam ekran için)"
          >
            <ExternalLink />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={handleTestTitle} title="Başlık testi">
            <Search />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={handleCopy} title="Bağlantıyı kopyala">
            {copied ? <Check className="text-success" /> : <Copy />}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <Badge variant="outline">{video.type}</Badge>
        {sizeLabel && <Badge variant="secondary">{sizeLabel}</Badge>}
        {resolution && <Badge variant="info">{resolution}</Badge>}
      </div>

      {testResult && (
        <p
          className="truncate rounded-sm bg-success/10 px-2 py-1 font-mono text-[11px] text-success"
          title={testResult}
        >
          {testResult}
        </p>
      )}

      <div className={cn(previewFrame, 'group')}>
        {isYouTube ? (
          <button
            type="button"
            className="flex h-[120px] w-full items-center justify-center bg-black"
            onClick={handleOpenInNewTab}
            title="YouTube videosunu yeni sekmede aç"
          >
            {ytVideoId ? (
              <img
                src={`https://img.youtube.com/vi/${ytVideoId}/hqdefault.jpg`}
                alt={video.title || 'YouTube Video'}
                className="h-full w-full object-cover opacity-80 transition-opacity duration-100 group-hover:opacity-100"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : null}
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/40 transition-colors duration-100 group-hover:bg-black/25">
              <YoutubeIcon className="h-7 w-7 text-red-600" />
              <span className="rounded-sm bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white/90">
                youtube · yt-dlp
              </span>
            </span>
          </button>
        ) : isAudio ? (
          <audio
            src={video.url}
            controls
            controlsList="nodownload"
            className="h-9 w-full outline-none"
          />
        ) : (
          // Fullscreen and PiP are intentionally off: full view happens in a new tab.
          <video
            src={`${video.url}${srcHash}`}
            preload="metadata"
            controls
            controlsList="nofullscreen nodownload"
            disablePictureInPicture
            onLoadedMetadata={handleLoadedMetadata}
            className="max-h-[140px] w-full bg-black object-contain"
          />
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          onClick={handleDownloadVDM}
          variant={vdmStatus === 'Sent!' ? 'secondary' : 'default'}
          className="flex-1"
          title="VDM masaüstü uygulamasına gönder"
        >
          {vdmStatus === 'Sent!' ? <Check className="text-success" /> : <Download />}
          <span>{vdmStatus}</span>
        </Button>

        <Button
          onClick={handleDownloadChrome}
          disabled={isYouTube}
          variant={chromeStatus === 'Started!' ? 'secondary' : 'outline'}
          className="flex-1"
          title={
            isYouTube
              ? 'YouTube için VDM masaüstü uygulaması gerekir (yt-dlp)'
              : 'Doğrudan Chrome ile indir'
          }
        >
          {chromeStatus === 'Started!' ? <Check className="text-success" /> : <ChromeIcon />}
          <span>{chromeStatus}</span>
        </Button>

        <Button
          onClick={onHide}
          variant="ghost"
          size="icon"
          className="hover:bg-destructive/10 hover:text-destructive"
          title="Bağlantıyı gizle"
        >
          <EyeOff />
        </Button>
      </div>
    </Card>
  );
}
