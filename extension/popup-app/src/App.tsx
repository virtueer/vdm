import {
  ChevronRight,
  Download,
  Moon,
  Music,
  Sun,
  ToggleLeft,
  ToggleRight,
  Video,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { MediaList } from '@/components/media/MediaList';
import { StatusBar } from '@/components/shell/StatusBar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBridgeConnection } from '@/hooks/useBridgeConnection';
import { useTheme } from '@/hooks/useTheme';
import { useVideoLinks } from '@/hooks/useVideoLinks';
import { mediaKindOf } from '@/lib/media';
import { cn } from '@/lib/utils';

const shell = cn(
  'flex h-[500px] w-full max-w-lg flex-col overflow-hidden bg-background',
  'border-x border-border/60 sm:h-screen'
);

const titleBar =
  'flex h-10 shrink-0 items-center gap-2.5 border-b border-border/60 bg-card/70 px-3';

const tabCount = 'font-mono text-[10px] tracking-tight text-muted-foreground/70';

export default function App() {
  const { links, loading, pageHost, autoIntercept, toggleAutoIntercept, setHidden } =
    useVideoLinks();
  const bridgeState = useBridgeConnection();
  const { theme, toggleTheme } = useTheme();
  const [tab, setTab] = useState<'video' | 'audio'>('video');

  const { video, audio } = useMemo(() => {
    const grouped = { video: [] as typeof links, audio: [] as typeof links };
    for (const link of links) grouped[mediaKindOf(link)].push(link);
    return grouped;
  }, [links]);

  const visibleCount = links.filter((link) => !link.hidden).length;
  const hiddenCount = links.length - visibleCount;

  return (
    <div className={shell}>
      <header className={titleBar}>
        <div className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-muted text-foreground/80">
          <Download className="h-3.5 w-3.5" />
        </div>

        <nav className="flex min-w-0 items-center gap-2 text-[13px]">
          <span className="font-medium tracking-tight text-foreground/90">VDM</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
          <span className="truncate text-muted-foreground">{pageHost || 'Bu sayfa'}</span>
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleAutoIntercept}
            title={autoIntercept ? 'Otomatik yakalama açık' : 'Otomatik yakalama kapalı'}
          >
            {autoIntercept ? (
              <ToggleRight className="text-success" />
            ) : (
              <ToggleLeft className="text-muted-foreground/60" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'}
          >
            {theme === 'dark' ? <Sun /> : <Moon />}
          </Button>
        </div>
      </header>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as 'video' | 'audio')}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="mx-2 mt-2 flex">
          <TabsTrigger value="video">
            <Video />
            <span>Video</span>
            <span className={tabCount}>{video.length}</span>
          </TabsTrigger>
          <TabsTrigger value="audio">
            <Music />
            <span>Ses</span>
            <span className={tabCount}>{audio.length}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="video" className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <MediaList links={video} loading={loading} onSetHidden={setHidden} kind="video" />
          </ScrollArea>
        </TabsContent>

        <TabsContent value="audio" className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <MediaList links={audio} loading={loading} onSetHidden={setHidden} kind="audio" />
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <StatusBar
        connection={bridgeState}
        mediaCount={visibleCount}
        hiddenCount={hiddenCount}
        autoIntercept={autoIntercept}
      />
    </div>
  );
}
