package main

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

var defaultClient = &http.Client{
	Timeout: 0,
	Transport: &http.Transport{
		Proxy:               http.ProxyFromEnvironment,
		TLSClientConfig:     &tls.Config{InsecureSkipVerify: true},
		DisableKeepAlives:   false,
		MaxIdleConns:        100,
		IdleConnTimeout:     90 * time.Second,
		TLSHandshakeTimeout: 10 * time.Second,
	},
}

type Manager struct {
	wailsApp    *application.App
	mainWindow  *application.WebviewWindow
	downloads   []DownloadItem
	cancelFuncs map[string]context.CancelFunc
	db          *DB
	mu          sync.Mutex
}

func (m *Manager) saveItemLocked(item DownloadItem) {
	if m.db != nil {
		_ = m.db.SaveDownload(item)
	}
}

func (m *Manager) scanExistingDownloadsLocked() {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return
	}

	dirsToScan := []string{
		filepath.Join(homeDir, "Downloads"),
	}

	if xdgDownload := os.Getenv("XDG_DOWNLOAD_DIR"); xdgDownload != "" && xdgDownload != dirsToScan[0] {
		dirsToScan = append(dirsToScan, xdgDownload)
	}

	videoExts := map[string]bool{
		".mp4": true, ".mkv": true, ".webm": true, ".mov": true, ".avi": true,
		".m4v": true, ".flv": true, ".ts": true, ".m4s": true, ".wmv": true,
		".3gp": true, ".mp3": true, ".m4a": true, ".aac": true, ".wav": true,
		".ogg": true,
	}

	existingByPath := make(map[string]int)
	existingByName := make(map[string]int)

	for i, d := range m.downloads {
		if d.Destination != "" {
			existingByPath[filepath.Clean(d.Destination)] = i
		}
		if d.URL != "" {
			existingByName[filepath.Base(d.URL)] = i
		}
		if d.Title != "" {
			existingByName[d.Title] = i
		}
	}

	var newDiscovered []DownloadItem

	for _, downloadDir := range dirsToScan {
		files, err := os.ReadDir(downloadDir)
		if err != nil {
			continue
		}

		for _, f := range files {
			if f.IsDir() {
				continue
			}
			ext := strings.ToLower(filepath.Ext(f.Name()))
			if !videoExts[ext] {
				continue
			}
			if strings.HasSuffix(f.Name(), ".part") || strings.HasSuffix(f.Name(), ".tmp") || strings.HasSuffix(f.Name(), ".aria2") {
				continue
			}

			fullPath := filepath.Clean(filepath.Join(downloadDir, f.Name()))

			// Skip items the user explicitly deleted from DB
			if m.db != nil && m.db.IsDeleted(fullPath, f.Name()) {
				continue
			}

			info, err := f.Info()
			if err != nil {
				continue
			}
			if info.Size() < 1024 {
				continue
			}

			if idx, exists := existingByPath[fullPath]; exists {
				if m.downloads[idx].TotalSize == "" || m.downloads[idx].TotalSize == "Unknown" || m.downloads[idx].TotalSize == "0 B" {
					m.downloads[idx].TotalSize = formatBytes(info.Size())
					m.downloads[idx].DownloadedSize = formatBytes(info.Size())
					m.saveItemLocked(m.downloads[idx])
				}
				continue
			}
			if idx, exists := existingByName[f.Name()]; exists {
				if m.downloads[idx].Destination == "" {
					m.downloads[idx].Destination = fullPath
				}
				if m.downloads[idx].TotalSize == "" || m.downloads[idx].TotalSize == "Unknown" || m.downloads[idx].TotalSize == "0 B" {
					m.downloads[idx].TotalSize = formatBytes(info.Size())
					m.downloads[idx].DownloadedSize = formatBytes(info.Size())
				}
				m.saveItemLocked(m.downloads[idx])
				existingByPath[fullPath] = idx
				continue
			}

			name := strings.TrimSuffix(f.Name(), ext)
			item := DownloadItem{
				ID:             fmt.Sprintf("%d", info.ModTime().UnixNano()),
				URL:            f.Name(),
				Title:          cleanVideoTitle(name),
				Destination:    fullPath,
				Status:         "completed",
				StatusMsg:      "Completed",
				Progress:       100.0,
				DownloadedSize: formatBytes(info.Size()),
				TotalSize:      formatBytes(info.Size()),
				CreatedAt:      info.ModTime().UnixMilli(),
			}
			newDiscovered = append(newDiscovered, item)
			m.saveItemLocked(item)
			existingByPath[fullPath] = len(m.downloads) + len(newDiscovered) - 1
		}
	}

	if len(newDiscovered) > 0 {
		m.downloads = append(m.downloads, newDiscovered...)
	}

	sort.Slice(m.downloads, func(i, j int) bool {
		return m.downloads[i].CreatedAt > m.downloads[j].CreatedAt
	})
}

func (m *Manager) ScanExistingDownloads() []DownloadItem {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.scanExistingDownloadsLocked()
	res := make([]DownloadItem, len(m.downloads))
	copy(res, m.downloads)
	return res
}

func NewManager() *Manager {
	db, err := InitDB()
	if err != nil {
		fmt.Printf("InitDB error: %v\n", err)
	}

	m := &Manager{
		downloads:   []DownloadItem{},
		cancelFuncs: make(map[string]context.CancelFunc),
		db:          db,
	}

	if m.db != nil {
		m.downloads = m.db.GetAllActiveDownloads()
	}
	return m
}

func (m *Manager) SetWailsApp(app *application.App) {
	m.wailsApp = app
}

func (m *Manager) SetWindow(w *application.WebviewWindow) {
	m.mainWindow = w
}

func (m *Manager) GetDownloads() []DownloadItem {
	m.mu.Lock()
	defer m.mu.Unlock()
	res := make([]DownloadItem, len(m.downloads))
	copy(res, m.downloads)
	return res
}

func (m *Manager) AddDownload(urlStr, title string) string {
	urlStr = strings.TrimSpace(urlStr)
	if urlStr == "" {
		return ""
	}

	cleanedTitle := cleanVideoTitle(title)
	if cleanedTitle == "" || cleanedTitle == "Video" || cleanedTitle == "Player" {
		cleanedTitle = cleanVideoTitle(extractFilenameFromURL(urlStr))
	}
	if cleanedTitle == "" || cleanedTitle == "Video" {
		cleanedTitle = fmt.Sprintf("Download_%d", time.Now().Unix())
	}

	id := fmt.Sprintf("%d", time.Now().UnixNano())
	nowMs := time.Now().UnixMilli()

	item := DownloadItem{
		ID:        id,
		URL:       urlStr,
		Title:     cleanedTitle,
		Status:    "pending",
		StatusMsg: "Starting...",
		CreatedAt: nowMs,
	}

	m.mu.Lock()
	m.downloads = append([]DownloadItem{item}, m.downloads...)
	m.saveItemLocked(item)
	m.mu.Unlock()

	if m.wailsApp != nil {
		m.wailsApp.Event.Emit("new_download", item)
	}

	if m.mainWindow != nil {
		m.mainWindow.Show()
		m.mainWindow.Focus()
	}

	go m.startDownloadProcess(id, urlStr, cleanedTitle)
	return id
}

func (m *Manager) startDownloadProcess(id, downloadUrl, title string) {
	ctx, cancel := context.WithCancel(context.Background())
	nowMs := time.Now().UnixMilli()

	m.mu.Lock()
	if oldCancel, exists := m.cancelFuncs[id]; exists {
		oldCancel()
	}
	m.cancelFuncs[id] = cancel

	for i, item := range m.downloads {
		if item.ID == id {
			m.downloads[i].Status = "downloading"
			m.downloads[i].StatusMsg = "Downloading..."
			m.downloads[i].StartedAt = nowMs
			m.saveItemLocked(m.downloads[i])
			if m.wailsApp != nil {
				m.wailsApp.Event.Emit("download_updated", m.downloads[i])
			}
			break
		}
	}
	m.mu.Unlock()

	defer func() {
		m.mu.Lock()
		delete(m.cancelFuncs, id)
		m.mu.Unlock()
		cancel()
	}()

	homeDir, _ := os.UserHomeDir()
	downloadDir := filepath.Join(homeDir, "Downloads")
	os.MkdirAll(downloadDir, 0755)

	filename := extractFilenameFromURL(downloadUrl)
	titleToUse := cleanVideoTitle(title)
	if titleToUse == "" || titleToUse == "Video" || titleToUse == "Player" {
		if filename != "" {
			titleToUse = cleanVideoTitle(strings.TrimSuffix(filename, filepath.Ext(filename)))
		}
	}
	if titleToUse == "" || titleToUse == "Video" {
		titleToUse = fmt.Sprintf("Download_%d", time.Now().Unix())
	}

	ext := filepath.Ext(filename)
	if ext == "" || ext == ".txt" || ext == ".m3u8" {
		ext = ".mp4"
	}
	filename = sanitizeFilename(titleToUse) + ext
	dest := filepath.Join(downloadDir, filename)
	partFile := dest + ".part"

	m.mu.Lock()
	for i, item := range m.downloads {
		if item.ID == id {
			m.downloads[i].Destination = dest
			m.downloads[i].Title = titleToUse
			m.saveItemLocked(m.downloads[i])
			if m.wailsApp != nil {
				m.wailsApp.Event.Emit("download_updated", m.downloads[i])
			}
			break
		}
	}
	m.mu.Unlock()

	// Check if this is an HLS playlist stream (.m3u8, master.txt, /hls/, etc.)
	if isHLSStream(downloadUrl, "") {
		err := m.downloadHLS(ctx, id, downloadUrl, dest)
		m.finalizeDownload(id, err)
		return
	}

	var existingBytes int64 = 0
	if fi, err := os.Stat(partFile); err == nil {
		existingBytes = fi.Size()
	}

	req, err := http.NewRequestWithContext(ctx, "GET", downloadUrl, nil)
	if err != nil {
		m.finalizeDownload(id, fmt.Errorf("request creation failed: %w", err))
		return
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36")
	if parsedUrl, err := url.Parse(downloadUrl); err == nil {
		origin := fmt.Sprintf("%s://%s", parsedUrl.Scheme, parsedUrl.Host)
		req.Header.Set("Referer", origin+"/")
		req.Header.Set("Origin", origin)
	}

	if existingBytes > 0 {
		req.Header.Set("Range", fmt.Sprintf("bytes=%d-", existingBytes))
	}

	resp, err := defaultClient.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return
		}
		m.finalizeDownload(id, fmt.Errorf("network error: %w", err))
		return
	}
	defer resp.Body.Close()

	var file *os.File
	var totalBytes int64 = -1
	var currentDownloaded int64 = 0

	if resp.StatusCode == http.StatusPartialContent {
		file, err = os.OpenFile(partFile, os.O_WRONLY|os.O_APPEND, 0644)
		if err != nil {
			m.finalizeDownload(id, fmt.Errorf("failed to open partial file: %w", err))
			return
		}
		currentDownloaded = existingBytes
		if resp.ContentLength > 0 {
			totalBytes = existingBytes + resp.ContentLength
		}
	} else if resp.StatusCode == http.StatusOK {
		file, err = os.OpenFile(partFile, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
		if err != nil {
			m.finalizeDownload(id, fmt.Errorf("failed to create file: %w", err))
			return
		}
		currentDownloaded = 0
		totalBytes = resp.ContentLength
	} else {
		m.finalizeDownload(id, fmt.Errorf("HTTP error: %s", resp.Status))
		return
	}
	defer file.Close()

	buf := make([]byte, 128*1024)
	lastReportTime := time.Now()
	lastReportBytes := currentDownloaded

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			if _, writeErr := file.Write(buf[:n]); writeErr != nil {
				m.finalizeDownload(id, fmt.Errorf("write error: %w", writeErr))
				return
			}
			currentDownloaded += int64(n)
		}

		now := time.Now()
		if now.Sub(lastReportTime) >= 250*time.Millisecond {
			duration := now.Sub(lastReportTime).Seconds()
			bytesDiff := currentDownloaded - lastReportBytes
			speedBytesPerSec := float64(bytesDiff) / duration

			speedStr := formatSpeed(speedBytesPerSec)
			dlStr := formatBytes(currentDownloaded)
			var totStr string
			if totalBytes > 0 {
				totStr = formatBytes(totalBytes)
			}

			var pct float64 = 0
			if totalBytes > 0 {
				pct = (float64(currentDownloaded) / float64(totalBytes)) * 100.0
				if pct > 100 {
					pct = 100
				}
			}

			m.mu.Lock()
			for i, item := range m.downloads {
				if item.ID == id {
					if m.downloads[i].Status == "downloading" {
						m.downloads[i].Progress = pct
						m.downloads[i].Speed = speedStr
						m.downloads[i].DownloadedSize = dlStr
						if totalBytes > 0 {
							m.downloads[i].TotalSize = totStr
						}
					}
					break
				}
			}
			m.mu.Unlock()

			if m.wailsApp != nil {
				m.wailsApp.Event.Emit("download_progress", map[string]interface{}{
					"id":         id,
					"percentage": fmt.Sprintf("%.1f", pct),
					"downloaded": dlStr,
					"total":      totStr,
					"speed":      speedStr,
				})
			}

			lastReportTime = now
			lastReportBytes = currentDownloaded
		}

		if readErr != nil {
			if readErr == io.EOF {
				break
			}
			m.finalizeDownload(id, readErr)
			return
		}
	}

	file.Close()

	if ctx.Err() != nil {
		return
	}

	if err := os.Rename(partFile, dest); err != nil {
		m.finalizeDownload(id, fmt.Errorf("failed to finalize file: %w", err))
		return
	}

	m.finalizeDownload(id, nil)
}

func (m *Manager) finalizeDownload(id string, err error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	for i, item := range m.downloads {
		if item.ID == id {
			if m.downloads[i].StartedAt > 0 {
				m.downloads[i].ElapsedSecs += (time.Now().UnixMilli() - m.downloads[i].StartedAt) / 1000
				m.downloads[i].StartedAt = 0
			}

			if m.downloads[i].Status == "paused" || m.downloads[i].Status == "cancelled" {
				return
			}

			if err != nil {
				m.downloads[i].Status = "error"
				m.downloads[i].StatusMsg = err.Error()
				m.downloads[i].ErrorDetails = err.Error()
				m.downloads[i].Speed = ""
			} else {
				m.downloads[i].Status = "completed"
				m.downloads[i].StatusMsg = "Completed"
				m.downloads[i].ErrorDetails = ""
				m.downloads[i].Progress = 100.0
				m.downloads[i].Speed = ""
			}

			m.saveItemLocked(m.downloads[i])

			if m.wailsApp != nil {
				m.wailsApp.Event.Emit("download_updated", m.downloads[i])
			}
			break
		}
	}
}

func (m *Manager) PauseDownload(id string) {
	m.mu.Lock()
	if cancel, exists := m.cancelFuncs[id]; exists {
		cancel()
		delete(m.cancelFuncs, id)
	}

	for i, item := range m.downloads {
		if item.ID == id {
			m.downloads[i].Status = "paused"
			m.downloads[i].StatusMsg = "Paused"
			m.downloads[i].Speed = ""
			if m.downloads[i].StartedAt > 0 {
				m.downloads[i].ElapsedSecs += (time.Now().UnixMilli() - m.downloads[i].StartedAt) / 1000
				m.downloads[i].StartedAt = 0
			}
			m.saveItemLocked(m.downloads[i])
			if m.wailsApp != nil {
				m.wailsApp.Event.Emit("download_updated", m.downloads[i])
			}
			break
		}
	}
	m.mu.Unlock()
}

func (m *Manager) ResumeDownload(id string) {
	m.mu.Lock()
	var urlStr, title string
	for i, item := range m.downloads {
		if item.ID == id && (item.Status == "paused" || item.Status == "error" || item.Status == "pending") {
			m.downloads[i].Status = "pending"
			m.downloads[i].StatusMsg = "Resuming..."
			m.downloads[i].ErrorDetails = ""
			urlStr = item.URL
			title = item.Title
			m.saveItemLocked(m.downloads[i])
			if m.wailsApp != nil {
				m.wailsApp.Event.Emit("download_updated", m.downloads[i])
			}
			break
		}
	}
	m.mu.Unlock()

	if urlStr != "" {
		go m.startDownloadProcess(id, urlStr, title)
	}
}

func (m *Manager) RemoveDownload(id string, deleteFile bool) {
	m.mu.Lock()
	if cancel, exists := m.cancelFuncs[id]; exists {
		cancel()
		delete(m.cancelFuncs, id)
	}

	indexToRemove := -1
	var fileToDelete string
	for i, item := range m.downloads {
		if item.ID == id {
			indexToRemove = i
			fileToDelete = item.Destination
			break
		}
	}

	if indexToRemove != -1 {
		m.downloads = append(m.downloads[:indexToRemove], m.downloads[indexToRemove+1:]...)
		if m.db != nil {
			if deleteFile {
				_ = m.db.HardDelete(id)
			} else {
				_ = m.db.MarkDeleted(id)
			}
		}
	}
	m.mu.Unlock()

	if m.wailsApp != nil {
		m.wailsApp.Event.Emit("download_removed", id)
	}

	homeDir, _ := os.UserHomeDir()
	downloadDir := filepath.Join(homeDir, "Downloads")

	if deleteFile && fileToDelete != "" {
		go func() {
			os.Remove(fileToDelete)
			os.Remove(fileToDelete + ".part")
			os.RemoveAll(filepath.Join(filepath.Dir(fileToDelete), fmt.Sprintf(".vdm_tmp_%s", id)))
			os.RemoveAll(filepath.Join(downloadDir, fmt.Sprintf(".vdm_tmp_%s", id)))
			os.RemoveAll(filepath.Join(os.TempDir(), fmt.Sprintf("xdm_hls_%s", id)))
		}()
	} else {
		go func() {
			if fileToDelete != "" {
				os.RemoveAll(filepath.Join(filepath.Dir(fileToDelete), fmt.Sprintf(".vdm_tmp_%s", id)))
			}
			os.RemoveAll(filepath.Join(downloadDir, fmt.Sprintf(".vdm_tmp_%s", id)))
			os.RemoveAll(filepath.Join(os.TempDir(), fmt.Sprintf("xdm_hls_%s", id)))
		}()
	}
}

func (m *Manager) ShowInFolder(id string) {
	var dest string
	homeDir, _ := os.UserHomeDir()
	downloadDir := filepath.Join(homeDir, "Downloads")

	m.mu.Lock()
	for _, item := range m.downloads {
		if item.ID == id {
			dest = item.Destination
			break
		}
	}
	m.mu.Unlock()

	if dest == "" {
		dest = downloadDir
	}

	dir := dest
	fileExists := false
	if fi, err := os.Stat(dest); err == nil {
		if !fi.IsDir() {
			dir = filepath.Dir(dest)
			fileExists = true
		} else {
			dir = dest
		}
	}

	go func() {
		switch runtime.GOOS {
		case "windows":
			if fileExists {
				exec.Command("explorer", "/select,"+dest).Run()
			} else {
				exec.Command("explorer", dir).Run()
			}
		case "darwin":
			if fileExists {
				exec.Command("open", "-R", dest).Run()
			} else {
				exec.Command("open", dir).Run()
			}
		default:
			// Linux:
			if fileExists {
				fileURI := "file://" + dest

				// 1. Try standard FreeDesktop / DBus FileManager1 interface (Supported by Nautilus, Dolphin, Nemo, Thunar, etc.)
				cmdDBus := exec.Command("dbus-send", "--session", "--dest=org.freedesktop.FileManager1", "--type=method_call",
					"/org/freedesktop/FileManager1", "org.freedesktop.FileManager1.ShowItems",
					"array:string:"+fileURI, "string:")
				if err := cmdDBus.Run(); err == nil {
					return
				}

				// 2. Try gdbus
				cmdGDBus := exec.Command("gdbus", "call", "--session", "--dest", "org.freedesktop.FileManager1",
					"--object-path", "/org/freedesktop/FileManager1",
					"--method", "org.freedesktop.FileManager1.ShowItems",
					fmt.Sprintf("['%s']", fileURI), "")
				if err := cmdGDBus.Run(); err == nil {
					return
				}

				// 3. Try specific file managers with select flags
				if _, err := exec.LookPath("nautilus"); err == nil {
					if err := exec.Command("nautilus", "--select", dest).Start(); err == nil {
						return
					}
				}
				if _, err := exec.LookPath("dolphin"); err == nil {
					if err := exec.Command("dolphin", "--select", dest).Start(); err == nil {
						return
					}
				}
				if _, err := exec.LookPath("nemo"); err == nil {
					if err := exec.Command("nemo", dest).Start(); err == nil {
						return
					}
				}
				if _, err := exec.LookPath("pcmanfm"); err == nil {
					if err := exec.Command("pcmanfm", "--select", dest).Start(); err == nil {
						return
					}
				}
				if _, err := exec.LookPath("pcmanfm-qt"); err == nil {
					if err := exec.Command("pcmanfm-qt", "--select", dest).Start(); err == nil {
						return
					}
				}
				if _, err := exec.LookPath("thunar"); err == nil {
					if err := exec.Command("thunar", dest).Start(); err == nil {
						return
					}
				}
			}

			// Fallback: open parent folder
			cmd := exec.Command("xdg-open", dir)
			if err := cmd.Run(); err != nil {
				for _, fm := range []string{"thunar", "nautilus", "dolphin", "nemo", "pcmanfm"} {
					if _, errLook := exec.LookPath(fm); errLook == nil {
						exec.Command(fm, dir).Start()
						break
					}
				}
			}
		}
	}()
}

func sanitizeFilename(name string) string {
	if name == "" {
		return ""
	}
	name = strings.ReplaceAll(name, "\n", " ")
	name = strings.ReplaceAll(name, "\r", " ")
	name = strings.ReplaceAll(name, "\t", " ")

	invalidChars := []string{"<", ">", ":", "\"", "/", "\\", "|", "?", "*"}
	for _, char := range invalidChars {
		name = strings.ReplaceAll(name, char, "_")
	}

	for strings.Contains(name, "  ") {
		name = strings.ReplaceAll(name, "  ", " ")
	}

	name = strings.TrimSpace(name)
	if len(name) > 100 {
		name = name[:100]
	}
	return strings.TrimSpace(name)
}

func extractFilenameFromURL(u string) string {
	parsed, err := url.Parse(u)
	if err == nil {
		path := parsed.Path
		parts := strings.Split(path, "/")
		var validParts []string
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if p != "" {
				validParts = append(validParts, p)
			}
		}

		genericNames := map[string]bool{
			"master.txt": true, "master.m3u8": true, "index.m3u8": true, "playlist.m3u8": true,
			"manifest.mpd": true, "sublist.txt": true, "sublist_2.txt": true, "sublist_aud1.txt": true,
			"sublist_aud2.txt": true, "playlist.txt": true, "chunklist.m3u8": true, "video.m3u8": true,
			"audio.m3u8": true, "stream.m3u8": true, "mono.m3u8": true, "master": true, "index": true,
			"video": true, "audio": true,
		}

		for i := len(validParts) - 1; i >= 0; i-- {
			part := validParts[i]
			lower := strings.ToLower(part)

			if genericNames[lower] || strings.HasPrefix(lower, "sublist") || strings.HasPrefix(lower, "chunk") ||
				lower == "hls" || lower == "vod" || lower == "videos" || lower == "api" {
				continue
			}

			if part != "" {
				ext := filepath.Ext(part)
				if ext == "" || ext == ".txt" || ext == ".m3u8" || ext == ".mpd" {
					part = strings.TrimSuffix(part, ext) + ".mp4"
				}
				return part
			}
		}

		if len(validParts) > 0 {
			last := validParts[len(validParts)-1]
			ext := filepath.Ext(last)
			if ext == "" || ext == ".txt" || ext == ".m3u8" {
				last = strings.TrimSuffix(last, ext) + ".mp4"
			}
			return last
		}
	}
	return fmt.Sprintf("download_%d.mp4", time.Now().Unix())
}

func formatBytes(b int64) string {
	if b >= 1024*1024*1024 {
		return fmt.Sprintf("%.2f GB", float64(b)/(1024*1024*1024))
	}
	if b >= 1024*1024 {
		return fmt.Sprintf("%.2f MB", float64(b)/(1024*1024))
	}
	if b >= 1024 {
		return fmt.Sprintf("%.2f KB", float64(b)/1024)
	}
	return fmt.Sprintf("%d B", b)
}

func formatSpeed(bytesPerSec float64) string {
	if bytesPerSec >= 1024*1024 {
		return fmt.Sprintf("%.2f MB/s", bytesPerSec/(1024*1024))
	}
	if bytesPerSec >= 1024 {
		return fmt.Sprintf("%.2f KB/s", bytesPerSec/1024)
	}
	return fmt.Sprintf("%.0f B/s", bytesPerSec)
}

func cleanVideoTitle(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}

	// Remove extension
	ext := filepath.Ext(raw)
	if ext == ".mp4" || ext == ".mkv" || ext == ".avi" || ext == ".txt" || ext == ".m3u8" || ext == ".ts" || ext == ".webm" {
		raw = strings.TrimSuffix(raw, ext)
	}

	// 1. Remove website branding / suffixes
	siteRegexes := []*regexp.Regexp{
		regexp.MustCompile(`(?i)\s*[-–—|•/]\s*(dizipal|dizigom|filmmodu|fullhdfilmizlesene|hdfilmcehennemi|hdcehennemi|inat|sezonlukdizi|diziwatch|yabancidizi|filmevreni|youtube|vdm|netflix|disney\+?|prime\s*video|hbo\s*max|blutv|gain|exxen).*$`),
		regexp.MustCompile(`(?i)\s*(tek parça|full hd|1080p|720p|4k|uhd)?\s*(türkçe dublaj|türkçe altyazılı|altyazılı|dublaj)?\s*(izle|seyret)\s*.*$`),
	}
	for _, re := range siteRegexes {
		raw = re.ReplaceAllString(raw, "")
	}

	// 2. If it's a URL slug with hashes and release tags
	if strings.Contains(raw, "-") || strings.Contains(raw, "_") || (strings.Contains(raw, ".") && !strings.Contains(raw, " ")) {
		// Strip random alphanumeric hashes (e.g. -00RjrN8j8nt, -rx7ra4pfi8uxmp4, -tt13668894)
		reHashes := regexp.MustCompile(`(?i)[-_.](tt\d+|rx[a-z0-9]+|[0-9a-zA-Z]{8,}|[0-9a-f]{12,}|mp4|mkv)$`)
		for i := 0; i < 6; i++ {
			trimmed := reHashes.ReplaceAllString(raw, "")
			if trimmed == raw {
				break
			}
			raw = trimmed
		}

		// Strip release tags (webdl, web-dl, trdual, dual, bluray, x264, x265, 1080p, etc.)
		reReleaseTags := regexp.MustCompile(`(?i)[-_.](web-?dl|web-?rip|bluray|bdrip|hdrip|dvdrip|trdual|dual|x264|x265|hevc|aac|ac3|dts|remux|repack|proper|1080p|720p|480p|2160p|4k)`)
		for i := 0; i < 4; i++ {
			trimmed := reReleaseTags.ReplaceAllString(raw, "")
			if trimmed == raw {
				break
			}
			raw = trimmed
		}

		// Replace dashes and underscores with spaces
		raw = strings.ReplaceAll(raw, "-", " ")
		raw = strings.ReplaceAll(raw, "_", " ")

		// If words were separated by dots e.g. "Breaking.Bad.S05E14", replace dots not following numbers with spaces
		reDots := regexp.MustCompile(`([^0-9])\.|\.([^0-9\s])`)
		raw = reDots.ReplaceAllString(raw, "$1 $2")
		raw = strings.TrimSpace(raw)

		// Format season/episode like s01e01 -> S01E01
		reEp := regexp.MustCompile(`(?i)\b(s\d{1,2})\s*(e\d{1,2})\b`)
		raw = reEp.ReplaceAllStringFunc(raw, func(s string) string {
			s = strings.ReplaceAll(s, " ", "")
			return strings.ToUpper(s)
		})
	}

	// 3. Normalize whitespace
	reSpaces := regexp.MustCompile(`\s+`)
	raw = reSpaces.ReplaceAllString(raw, " ")
	raw = strings.TrimSpace(raw)

	return raw
}

type ffprobeOutput struct {
	Streams []struct {
		Index         int               `json:"index"`
		CodecName     string            `json:"codec_name"`
		CodecLongName string            `json:"codec_long_name"`
		CodecType     string            `json:"codec_type"`
		Width         int               `json:"width"`
		Height        int               `json:"height"`
		DisplayAspect string            `json:"display_aspect_ratio"`
		RFrameRate    string            `json:"r_frame_rate"`
		BitRate       string            `json:"bit_rate"`
		Channels      int               `json:"channels"`
		ChannelLayout string            `json:"channel_layout"`
		SampleRate    string            `json:"sample_rate"`
		Tags          map[string]string `json:"tags"`
	} `json:"streams"`
	Format struct {
		FormatName     string `json:"format_name"`
		FormatLongName string `json:"format_long_name"`
		Duration       string `json:"duration"`
		Size           string `json:"size"`
		BitRate        string `json:"bit_rate"`
	} `json:"format"`
}

func (m *Manager) GetMediaInfo(target string) (*MediaInfo, error) {
	filePath := target

	// If target is a download ID, look up its destination file
	m.mu.Lock()
	for _, item := range m.downloads {
		if item.ID == target {
			if item.Destination != "" {
				filePath = item.Destination
			}
			break
		}
	}
	m.mu.Unlock()

	fi, err := os.Stat(filePath)
	if err != nil {
		return nil, fmt.Errorf("dosya bulunamadı: %w", err)
	}

	cmd := exec.Command("ffprobe",
		"-v", "error",
		"-show_entries", "format=duration,size,bit_rate,format_name,format_long_name:stream=index,codec_name,codec_long_name,codec_type,width,height,display_aspect_ratio,r_frame_rate,bit_rate,channels,channel_layout,sample_rate,tags",
		"-of", "json",
		filePath)

	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("ffprobe analizi başarısız: %s (%w)", string(out), err)
	}

	var raw ffprobeOutput
	if err := json.Unmarshal(out, &raw); err != nil {
		return nil, fmt.Errorf("metadata okunamadı: %w", err)
	}

	info := &MediaInfo{
		FilePath:        filePath,
		FileName:        filepath.Base(filePath),
		SizeBytes:       fi.Size(),
		FileSize:        formatBytes(fi.Size()),
		FormatName:      raw.Format.FormatLongName,
		VideoStreams:    []StreamInfo{},
		AudioStreams:    []StreamInfo{},
		SubtitleStreams: []StreamInfo{},
	}
	if info.FormatName == "" {
		info.FormatName = raw.Format.FormatName
	}

	if raw.Format.Duration != "" {
		if dSecs, err := strconv.ParseFloat(raw.Format.Duration, 64); err == nil {
			info.DurationSecs = dSecs
			info.Duration = formatDurationSecs(int64(dSecs))
		}
	}

	if raw.Format.BitRate != "" {
		if br, err := strconv.ParseInt(raw.Format.BitRate, 10, 64); err == nil {
			info.OverallBitrate = formatBitrate(br)
		}
	}

	for _, s := range raw.Streams {
		st := StreamInfo{
			Index:     s.Index,
			CodecType: s.CodecType,
			CodecName: strings.ToUpper(s.CodecName),
			CodecLong: s.CodecLongName,
		}

		if s.Tags != nil {
			if l, ok := s.Tags["language"]; ok {
				st.Language = l
			}
			if t, ok := s.Tags["title"]; ok {
				st.Title = t
			}
		}

		if s.BitRate != "" {
			if br, err := strconv.ParseInt(s.BitRate, 10, 64); err == nil {
				st.Bitrate = formatBitrate(br)
			}
		}

		switch s.CodecType {
		case "video":
			st.Width = s.Width
			st.Height = s.Height
			qualityLabel := ""
			if s.Height >= 2160 {
				qualityLabel = " (4K UHD)"
			} else if s.Height >= 1080 {
				qualityLabel = " (1080p Full HD)"
			} else if s.Height >= 720 {
				qualityLabel = " (720p HD)"
			} else if s.Height >= 480 {
				qualityLabel = " (480p SD)"
			}
			st.Resolution = fmt.Sprintf("%dx%d%s", s.Width, s.Height, qualityLabel)
			st.AspectRatio = s.DisplayAspect

			if s.RFrameRate != "" && s.RFrameRate != "0/0" {
				parts := strings.Split(s.RFrameRate, "/")
				if len(parts) == 2 {
					num, _ := strconv.ParseFloat(parts[0], 64)
					den, _ := strconv.ParseFloat(parts[1], 64)
					if den > 0 {
						st.FPS = fmt.Sprintf("%.2f fps", num/den)
						st.FPS = strings.TrimSuffix(st.FPS, ".00 fps") + " fps"
					}
				}
			}

			info.VideoStreams = append(info.VideoStreams, st)

		case "audio":
			st.Channels = s.Channels
			st.ChannelLay = s.ChannelLayout
			if s.SampleRate != "" {
				if sr, err := strconv.Atoi(s.SampleRate); err == nil {
					st.SampleRate = fmt.Sprintf("%.1f kHz", float64(sr)/1000.0)
				}
			}
			info.AudioStreams = append(info.AudioStreams, st)

		case "subtitle":
			info.SubtitleStreams = append(info.SubtitleStreams, st)
		}
	}

	return info, nil
}

func formatBitrate(b int64) string {
	if b >= 1000*1000 {
		return fmt.Sprintf("%.2f Mbps", float64(b)/1000000.0)
	}
	if b >= 1000 {
		return fmt.Sprintf("%d kbps", b/1000)
	}
	return fmt.Sprintf("%d bps", b)
}

func formatDurationSecs(seconds int64) string {
	hrs := seconds / 3600
	mins := (seconds % 3600) / 60
	secs := seconds % 60
	if hrs > 0 {
		return fmt.Sprintf("%02d:%02d:%02d (%d sa %d dk)", hrs, mins, secs, hrs, mins)
	}
	return fmt.Sprintf("%02d:%02d (%d dk %d sn)", mins, secs, mins, secs)
}
