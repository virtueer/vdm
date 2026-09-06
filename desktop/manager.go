package main

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

const MaxConcurrentActive = 2

var defaultTransport = &http.Transport{
	Proxy:                 http.ProxyFromEnvironment,
	TLSClientConfig:       &tls.Config{InsecureSkipVerify: true},
	DisableKeepAlives:     false,
	MaxIdleConns:          256,
	MaxIdleConnsPerHost:   128,
	MaxConnsPerHost:       0, // unlimited
	IdleConnTimeout:       120 * time.Second,
	TLSHandshakeTimeout:   10 * time.Second,
	ResponseHeaderTimeout: 30 * time.Second,
	ExpectContinueTimeout: 1 * time.Second,
	ForceAttemptHTTP2:     true,
	WriteBufferSize:       128 * 1024,
	ReadBufferSize:        128 * 1024,
	DialContext: (&net.Dialer{
		Timeout:   15 * time.Second,
		KeepAlive: 30 * time.Second,
	}).DialContext,
}

var defaultClient = &http.Client{
	Timeout:   0,
	Transport: defaultTransport,
}

type Manager struct {
	wailsApp    *application.App
	mainWindow  *application.WebviewWindow
	downloads   []DownloadItem
	cancelFuncs map[string]context.CancelFunc
	db          *DB
	mu          sync.Mutex
}

func NewManager() *Manager {
	db, err := InitDB()
	if err != nil {
		fmt.Printf("Warning: Failed to initialize SQLite database: %v\n", err)
	}

	m := &Manager{
		downloads:   []DownloadItem{},
		cancelFuncs: make(map[string]context.CancelFunc),
		db:          db,
	}

	if db != nil {
		m.downloads = db.GetAllActiveDownloads()
	}

	// Always scan ~/Downloads folder on startup and merge any media files
	m.scanExistingDownloadsLocked()

	// Enforce queue limit on startup
	m.processQueueLocked()

	return m
}

func (m *Manager) saveItemLocked(item DownloadItem) {
	if m.db != nil {
		_ = m.db.SaveDownload(item)
	}
}

func (m *Manager) SetWailsApp(app *application.App) {
	m.wailsApp = app
}

func (m *Manager) SetWindow(w *application.WebviewWindow) {
	m.mainWindow = w
}

func (m *Manager) processQueueLocked() {
	activeCount := 0
	for _, item := range m.downloads {
		if item.Status == "downloading" {
			activeCount++
		}
	}

	slotsAvailable := MaxConcurrentActive - activeCount
	if slotsAvailable > 0 {
		// Start oldest queued / pending items first (from end of slice to start)
		for i := len(m.downloads) - 1; i >= 0 && slotsAvailable > 0; i-- {
			if m.downloads[i].Status == "pending" || m.downloads[i].Status == "queued" {
				id := m.downloads[i].ID
				urlStr := m.downloads[i].URL
				title := m.downloads[i].Title
				m.downloads[i].Status = "downloading"
				m.downloads[i].StatusMsg = "Starting..."
				m.downloads[i].StartedAt = time.Now().UnixMilli()
				m.saveItemLocked(m.downloads[i])
				if m.wailsApp != nil {
					m.wailsApp.Event.Emit("download_updated", m.downloads[i])
				}
				slotsAvailable--
				go m.startDownloadProcess(id, urlStr, title)
			}
		}
	}

	// Update queue numbers for remaining waiting items
	queuePos := 1
	for i := len(m.downloads) - 1; i >= 0; i-- {
		if m.downloads[i].Status == "queued" || m.downloads[i].Status == "pending" {
			m.downloads[i].Status = "queued"
			m.downloads[i].StatusMsg = fmt.Sprintf("Kuyrukta bekliyor (#%d)", queuePos)
			queuePos++
			m.saveItemLocked(m.downloads[i])
			if m.wailsApp != nil {
				m.wailsApp.Event.Emit("download_updated", m.downloads[i])
			}
		}
	}
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
		StatusMsg: "Kuyruğa alındı...",
		CreatedAt: nowMs,
	}

	m.mu.Lock()
	m.downloads = append([]DownloadItem{item}, m.downloads...)
	m.saveItemLocked(item)
	m.processQueueLocked()
	m.mu.Unlock()

	if m.wailsApp != nil {
		m.wailsApp.Event.Emit("new_download", item)
	}

	if m.mainWindow != nil {
		m.mainWindow.Show()
		m.mainWindow.Focus()
	}

	return id
}

func (m *Manager) startDownloadProcess(id, downloadUrl, title string) {
	ctx, cancel := context.WithCancel(context.Background())

	m.mu.Lock()
	if oldCancel, exists := m.cancelFuncs[id]; exists {
		oldCancel()
	}
	m.cancelFuncs[id] = cancel
	m.mu.Unlock()

	defer func() {
		m.mu.Lock()
		delete(m.cancelFuncs, id)
		m.mu.Unlock()
		cancel()
	}()

	homeDir, _ := os.UserHomeDir()
	downloadDir := filepath.Join(homeDir, "Downloads")
	_ = os.MkdirAll(downloadDir, 0755)

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

	err := m.downloadDirect(ctx, id, downloadUrl, dest)
	m.finalizeDownload(id, err)
}

func (m *Manager) finalizeDownload(id string, err error) {
	m.mu.Lock()
	for i, item := range m.downloads {
		if item.ID == id {
			if m.downloads[i].StartedAt > 0 {
				m.downloads[i].ElapsedSecs += (time.Now().UnixMilli() - m.downloads[i].StartedAt) / 1000
				m.downloads[i].StartedAt = 0
			}

			if m.downloads[i].Status == "paused" || m.downloads[i].Status == "cancelled" {
				m.processQueueLocked()
				m.mu.Unlock()
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
	m.processQueueLocked()
	m.mu.Unlock()
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
	m.processQueueLocked()
	m.mu.Unlock()
}

func (m *Manager) ResumeDownload(id string) {
	m.mu.Lock()
	for i, item := range m.downloads {
		if item.ID == id && (item.Status == "paused" || item.Status == "error" || item.Status == "pending" || item.Status == "queued") {
			m.downloads[i].Status = "pending"
			m.downloads[i].StatusMsg = "Kuyruğa alındı..."
			m.downloads[i].ErrorDetails = ""
			m.saveItemLocked(m.downloads[i])
			if m.wailsApp != nil {
				m.wailsApp.Event.Emit("download_updated", m.downloads[i])
			}
			break
		}
	}
	m.processQueueLocked()
	m.mu.Unlock()
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
		m.processQueueLocked()
	}
	m.mu.Unlock()

	if m.wailsApp != nil {
		m.wailsApp.Event.Emit("download_removed", id)
	}

	homeDir, _ := os.UserHomeDir()
	downloadDir := filepath.Join(homeDir, "Downloads")

	if deleteFile && fileToDelete != "" {
		go func() {
			_ = os.Remove(fileToDelete)
			_ = os.Remove(fileToDelete + ".part")
			_ = os.Remove(fileToDelete + ".vdm_state")
			_ = os.RemoveAll(filepath.Join(filepath.Dir(fileToDelete), fmt.Sprintf(".vdm_tmp_%s", id)))
			_ = os.RemoveAll(filepath.Join(downloadDir, fmt.Sprintf(".vdm_tmp_%s", id)))
			_ = os.RemoveAll(filepath.Join(os.TempDir(), fmt.Sprintf("xdm_hls_%s", id)))
		}()
	} else {
		go func() {
			if fileToDelete != "" {
				_ = os.RemoveAll(filepath.Join(filepath.Dir(fileToDelete), fmt.Sprintf(".vdm_tmp_%s", id)))
			}
			_ = os.RemoveAll(filepath.Join(downloadDir, fmt.Sprintf(".vdm_tmp_%s", id)))
			_ = os.RemoveAll(filepath.Join(os.TempDir(), fmt.Sprintf("xdm_hls_%s", id)))
		}()
	}
}
