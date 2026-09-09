# VDM Desktop

Go + [Wails v3](https://v3.wails.io) application: the download engines, the local HTTP bridge the
browser extension talks to, and the React UI that drives them. See the [root README](../README.md)
for installation and usage.

## Architecture

```
main.go        window + service wiring (1200x800, starts maximised)
app.go         Wails service; the methods bound to the frontend
manager.go     download queue, item state, event emission, HTTP transport
direct.go      direct media: multi-part HTTP range downloads with resume
hls.go         HLS: playlist parsing, init segments, segment fetch, ffmpeg mux
scanner.go     rebuilds history from the Downloads folder
mediainfo.go   ffprobe wrapper for the analysis panel
db.go          SQLite persistence + JSON migration
server.go      HTTP bridge for the extension (127.0.0.1:9614)
show_folder.go reveals a file in the platform file manager
utils.go       byte/speed/duration formatting, filename sanitising
models.go      DownloadItem, MediaInfo, stream types
```

**Download flow.** `Manager.AddDownload` stores the item and asks the queue for a slot. At most
`MaxConcurrentActive = 2` downloads run at once; everything else is marked `queued` with its position
in `statusMsg`. `startDownloadProcess` resolves the destination filename, then picks an engine:
`isHLSStream()` sends it to the HLS path, anything else to the direct path.

**Direct downloads** probe with `HEAD` (and a `bytes=0-0` range request when that is inconclusive).
Files above 4 MB whose server supports ranges are split into parts and fetched in parallel into a
`.part` file with a sidecar state file, so a paused or crashed download resumes where it stopped.
Everything else streams in one connection, resuming with a `Range` header.

**HLS downloads** parse the playlist, resolve variant and audio renditions, download segments
(including `EXT-X-MAP` init segments), and mux with `ffmpeg` when it is on `PATH`; without ffmpeg the
segments are concatenated directly.

**Persistence** lives in SQLite at `$XDG_CONFIG_HOME/vdm/vdm.db` (WAL mode). Deleted items are
tombstoned so a folder rescan does not resurrect them.

## Frontend bindings

`Call.ByName('main.App.<Method>')` from the frontend:

| Method | Signature |
| --- | --- |
| `GetDownloads` | `() []DownloadItem` |
| `ScanDownloads` | `() []DownloadItem` |
| `AddDownload` | `(url, title string) string` |
| `PauseDownload` | `(id string)` |
| `ResumeDownload` | `(id string)` |
| `RemoveDownload` | `(id string, deleteFile bool)` |
| `ShowInFolder` | `(id string)` |
| `GetMediaInfo` | `(target string) (*MediaInfo, error)` |

Events emitted to the window:

| Event | Payload |
| --- | --- |
| `new_download` | `DownloadItem` |
| `download_updated` | `DownloadItem` |
| `download_progress` | `{ id, percentage, downloaded, total, speed, statusMsg }` |
| `download_removed` | `id` |

## HTTP bridge (`:9614`)

Used by the extension, and by the frontend as a fallback when the Wails bindings are not ready.
All responses send `Access-Control-Allow-Origin: *`.

| Method | Path | Body / query | Returns |
| --- | --- | --- | --- |
| `GET` | `/api/downloads` | — | `DownloadItem[]` |
| `POST` | `/api/scan` | — | `DownloadItem[]` after a folder rescan |
| `POST` | `/api/download` | `{ url, title?, pageUrl?, size?, type? }` — only `url` and `title` are used | `{ status, id }` |
| `POST` | `/api/pause` | `{ id }` | status |
| `POST` | `/api/resume` | `{ id }` | status |
| `POST` | `/api/delete` | `{ id, deleteFile }` | status |
| `GET` | `/api/mediainfo` | `?target=<path or id>` | `MediaInfo` |
| `POST` | `/api/show` | `?id=<id>` (query, not body) | status |

`HEAD /api/downloads` is answered like `GET` with no body, which is what both UIs use as a cheap
reachability probe for the connection indicator.

## Frontend

React 19 + Tailwind 3 + shadcn/ui (new-york), built by Vite into `frontend/dist` and embedded into
the binary with `go:embed`.

```
frontend/src/
├── App.tsx                     composition only; modals are lazy-loaded
├── components/
│   ├── ui/                     design system primitives (shadcn)
│   ├── shell/                  TitleBar, StatusBar
│   └── ErrorBoundary.tsx
├── features/downloads/
│   ├── api.ts                  Wails-first API with HTTP bridge fallback
│   ├── events.ts               Wails event plumbing, isolated from React
│   ├── status.ts               status → label / badge / progress tone
│   ├── hooks/useDownloads.ts   list state, initial load, live updates
│   └── components/             DownloadCard, DownloadList, EmptyState, modals/
├── hooks/                      useBridgeConnection, useHotkeys, useTheme, useLazyMount
└── lib/                        bridge (transport + connection store), theme, format, utils
```

Theming is driven by CSS variables on `:root` / `.dark`, including semantic status tones
(`--success`, `--warning`, `--info`, `--danger`) that resolve per theme, so components never need
`dark:` colour pairs. An inline script in `index.html` applies the stored theme before first paint.

The four dialogs are `React.lazy` chunks, which keeps Radix Dialog and ScrollArea out of the startup
bundle (~74 kB gzip initial, down from ~107 kB).

## Commands

```bash
wails3 dev      # hot reload for Go + frontend
wails3 build    # production binary into bin/

cd frontend
pnpm dev        # frontend only, against the bridge on :9614
pnpm lint       # Biome
pnpm typecheck  # tsc -b
pnpm build      # bundle into dist/
```

Regenerate platform icons after changing `../assets/icon.svg`:

```bash
rsvg-convert -w 1024 -h 1024 ../assets/icon.svg -o build/appicon.png
cd build && wails3 generate icons -input appicon.png \
  -macfilename darwin/icons.icns -windowsfilename windows/icon.ico
```
