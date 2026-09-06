package main

import (
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
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
	mu          sync.Mutex
}

func NewManager() *Manager {
	return &Manager{
		downloads:   []DownloadItem{},
		cancelFuncs: make(map[string]context.CancelFunc),
	}
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
				m.downloads[i].Speed = ""
			} else {
				m.downloads[i].Status = "completed"
				m.downloads[i].StatusMsg = "Completed"
				m.downloads[i].Progress = 100.0
				m.downloads[i].Speed = ""
			}

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
			urlStr = item.URL
			title = item.Title
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
	}
	m.mu.Unlock()

	if m.wailsApp != nil {
		m.wailsApp.Event.Emit("download_removed", id)
	}

	if deleteFile && fileToDelete != "" {
		go func() {
			os.Remove(fileToDelete)
			os.Remove(fileToDelete + ".part")
			os.RemoveAll(filepath.Join(os.TempDir(), fmt.Sprintf("xdm_hls_%s", id)))
		}()
	} else {
		go func() {
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
	if fi, err := os.Stat(dest); err == nil && !fi.IsDir() {
		dir = filepath.Dir(dest)
	}

	go func() {
		switch runtime.GOOS {
		case "windows":
			if _, err := os.Stat(dest); err == nil {
				exec.Command("explorer", "/select,"+dest).Run()
			} else {
				exec.Command("explorer", dir).Run()
			}
		case "darwin":
			if _, err := os.Stat(dest); err == nil {
				exec.Command("open", "-R", dest).Run()
			} else {
				exec.Command("open", dir).Run()
			}
		default:
			// Linux: try xdg-open on directory or dedicated file managers
			cmd := exec.Command("xdg-open", dir)
			if err := cmd.Run(); err != nil {
				for _, fm := range []string{"nautilus", "dolphin", "thunar", "nemo", "pcmanfm"} {
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
