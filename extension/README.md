# VDM Chrome Extension

Manifest V3 extension that captures media streams on the pages you visit and hands them to the VDM
desktop app. See the [root README](../README.md) for installation and usage.

## Layout

```
extension/
├── manifest.json     MV3 manifest, icons, permissions
├── background.js     service worker: capture, badge, storage, Chrome downloads
├── content.js        in-page <video>/<source> scan, page title, YouTube detection
├── icons/            toolbar and store icons (generated from ../assets/icon.svg)
├── popup-app/        React popup source (Vite)
└── popup-dist/       popup build output — loaded by manifest.action.default_popup
```

## How capture works

The service worker listens to `chrome.webRequest.onHeadersReceived` for every request and keeps the
ones whose `Content-Type` looks like media:

- `video/*`, `audio/*`
- `application/x-mpegurl`, `application/vnd.apple.mpegurl` (HLS)
- `application/dash+xml` (DASH)
- `application/octet-stream` when the URL ends in `.mp4`, `.mkv` or `.ts`

`content.js` complements this by scanning the DOM for `<video>` and `<source>` elements and by
reporting YouTube navigations (`yt-navigate-finish`, `popstate`), which the network layer skips on
purpose so YouTube pages produce one page-level entry rather than dozens of chunk requests.

Captures are grouped per tab in `chrome.storage.local`, shown as a badge count on the toolbar icon,
and cleared when the tab is closed or navigated away.

## Message API

`chrome.runtime.sendMessage` actions handled by the service worker:

| Action | Payload | Response |
| --- | --- | --- |
| `getVideoLinks` | `{ tabId }` | `{ links: VideoLink[] }` |
| `addVideoLinkFromDOM` | `{ link }` | stores a DOM-discovered link |
| `hideVideoLink` / `showVideoLink` | `{ tabId, url }` | toggles the hidden flag |
| `getAutoIntercept` | — | `{ autoIntercept }` |
| `toggleAutoIntercept` | — | `{ success, autoIntercept }` |
| `setYouTubeVideo` / `clearYouTubeVideo` | page info | maintains the YouTube entry for a tab |
| `downloadWithChrome` | `{ url, filename }` | `{ success }` or `{ error }` |

`content.js` answers `getPageTitle` for title extraction.

Sending a capture to the desktop app is a plain HTTP call from the popup:

```http
POST http://localhost:9614/api/download
{ "url": "...", "type": "network", "size": "50 MB", "pageUrl": "...", "title": "..." }
```

The popup polls `HEAD /api/downloads` every 5 s to show whether the desktop app is reachable.

## Popup app

React 19 + Tailwind 3 + shadcn/ui, sharing the desktop app's design system and theme tokens.

```
popup-app/src/
├── App.tsx                 title strip, Video/Ses tabs, status bar
├── components/
│   ├── ui/                 design system primitives (shadcn)
│   ├── media/              MediaCard, MediaList
│   └── shell/StatusBar.tsx
├── hooks/                  useVideoLinks, useBridgeConnection, useTheme
└── lib/                    bridge (desktop app transport), chrome (promise wrappers),
                            media (video/audio classifier), title, theme, utils
```

Notes:

- `lib/chrome.ts` wraps the callback-based extension APIs in promises and handles
  `chrome.runtime.lastError` in one place, so components never branch on `typeof chrome`.
- Outside the extension (e.g. `pnpm dev` in a browser tab) the popup falls back to demo links, which
  makes UI work possible without loading the extension.
- Video previews deliberately disable fullscreen and picture-in-picture (`controlsList`,
  `disablePictureInPicture`, plus a rule that hides the native fullscreen button). Full-size viewing
  goes through the "open in new tab" action.

## Build

```bash
cd popup-app
pnpm install
pnpm dev        # popup in a normal browser tab, with demo data
pnpm lint       # Biome
pnpm typecheck  # tsc -b
pnpm build      # writes ../popup-dist
```

Docker alternative, no local Node needed:

```bash
./build-extension.sh   # from the repository root
```

Then load `extension/` as an unpacked extension from `chrome://extensions/` with Developer mode on.

## Icons

`icons/icon{16,32,48,128}.png` are generated from the shared master:

```bash
for size in 16 32 48 128; do
  rsvg-convert -w $size -h $size ../assets/icon.svg -o icons/icon$size.png
done
```
