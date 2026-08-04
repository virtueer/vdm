# VDM - Video Download Manager

This project includes a Chrome Extension that automatically captures video streams (m3u8, mp4, etc.) you watch or load in the background, and a Desktop Application (Go & Wails v3) that quickly downloads these videos using powerful tools like **yt-dlp** and **aria2**.

## Project Components

The project consists of two main folders:
- **`extension/`**: A Google Chrome / Chromium extension that captures videos and notifies the desktop app.
- **`desktop/`**: A Go + Wails v3 based desktop GUI application that receives links from the extension (port 9614) and manages the download process.

---

## 🛠️ System Requirements

In order for the application to download videos in the background, the following two tools must be installed on your system and added to your `PATH` (Environment Variables):

1. **yt-dlp**: Advanced video downloader tool.
2. **aria2 (aria2c)**: Fast and multi-connection download utility.

### Installing Dependencies

**Windows:**
```powershell
# If using Scoop:
scoop install yt-dlp aria2

# Or if using Winget:
winget install yt-dlp
winget install aria2
```

**macOS:**
```bash
brew install yt-dlp aria2
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt update
sudo apt install yt-dlp aria2
```

**Linux (Arch/CachyOS etc.):**
```bash
sudo pacman -S yt-dlp aria2
```

---

## 🚀 Desktop App Installation (Desktop)

The desktop application is built with [Wails v3](https://v3.wails.io). If you want to compile the application from source, follow the steps below. If you have already downloaded a prebuilt version (`.exe`, `.dmg`, etc.), you can run it directly.

### Compiling from Source

1. Ensure **Go (1.25+)** is installed.
2. Ensure **Node.js & npm** are installed.
3. Install the Wails v3 CLI:
   ```bash
   go install github.com/wailsapp/wails/v3/cmd/wails3@latest
   ```
4. Install OS-specific Wails v3 dependencies:
   - **Linux:** `sudo pacman -S base-devel gtk4 webkitgtk-6.0` (for Arch-based) or `sudo apt install libgtk-4-dev libwebkitgtk-6.0-dev build-essential` (for Debian/Ubuntu).
   - **Windows:** No extra dependencies required (C++ Build Tools are sufficient).
   - **macOS:** Xcode Command Line Tools (`xcode-select --install`).
5. Open the terminal in the `desktop/` directory and build:
   ```bash
   cd desktop
   wails3 build
   ```
6. The output will be generated in the `desktop/bin/` directory. Run the `desktop` (or `desktop.exe`) file.

### 🐳 Cross-Compiling for All Platforms with Docker

Wails v3, through its Docker integration, allows you to cross-compile your code for all platforms on Windows, macOS, or Linux. It automatically resolves complex configurations like CGO.

**Requirements:**
- [Docker](https://www.docker.com/) must be installed and running on your system.

You can automatically generate builds for all platforms (Windows, Linux, macOS) using the **`build.sh`** script located in the root directory:

```bash
# Grant execution permissions (Linux/Mac)
chmod +x build.sh

# Start the build system
./build.sh
```

This process follows these steps:
1. Downloads the necessary Wails Docker images (`wails3 task setup:docker`).
2. Builds `vdm-windows-amd64.exe` for **Windows**.
3. Builds `vdm-linux-amd64` for **Linux**.
4. Builds `vdm-macos-arm64` and `vdm-macos-amd64` for **macOS** (Apple Silicon and Intel).

You can find all outputs in the `desktop/releases/` folder.

---

## 🧩 Extension Installation (Extension)

The Chrome extension must be installed for the application to capture videos.

1. Open **Google Chrome** or a Chromium-based browser (Brave, Edge, etc.).
2. Type `chrome://extensions/` in the address bar and press Enter.
3. Toggle the **"Developer mode"** switch in the top right corner.
4. Click the **"Load unpacked"** button in the top left.
5. Select the **`extension`** folder from the project.
6. You can pin the extension icon to the top right of your browser.

---

## 💡 How to Use

1. First, launch the **VDM Desktop** application. When the app opens, it will start listening on port 9614 to communicate with the extension in the background.
2. Go to a site containing a video (e.g., movie, series, or tutorial) in Chrome.
3. When the extension captures a video, it will notify you with a red badge on its icon.
4. Click the extension and press the **Download** button next to the video in the list.
5. The download command will automatically be sent to the desktop app, and the download process will begin.
6. Downloaded videos are saved to your system's default `Downloads` folder.

---

## 🌟 Features

- Captures all hidden streams in **M3U8 (HLS), DASH, MP4, and WebM** formats.
- Real-time tracking of HTML5 `<video>` tags within pages.
- Perform operations (Preview, Download, Copy) in a separate extension popup window.
- Modern, eye-friendly *Dark Mode* and *Glassmorphism* design in the desktop application.
- Ultra-fast download support by splitting the video into 16 chunks, thanks to **aria2** integration.
