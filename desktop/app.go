package main

import (
	"context"
	"fmt"
	"sync"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type DownloadItem struct {
	ID     string `json:"id"`
	URL    string `json:"url"`
	Type    string `json:"type"`
	Size    string `json:"size"`
	Status  string `json:"status"` // "pending", "downloading", "completed", "error"
	PageURL string `json:"pageUrl"`
}

type App struct {
	wailsApp    *application.App
	mainWindow  *application.WebviewWindow
	server      *Server
	downloads   []DownloadItem
	cancelFuncs map[string]context.CancelFunc
	mu          sync.Mutex
}

func NewApp() *App {
	app := &App{
		downloads:   []DownloadItem{},
		cancelFuncs: make(map[string]context.CancelFunc),
	}
	app.server = NewServer(app)
	return app
}

func (a *App) SetWailsApp(wailsApp *application.App) {
	a.wailsApp = wailsApp
}

func (a *App) SetWindow(w *application.WebviewWindow) {
	a.mainWindow = w
}

func (a *App) StartServer() {
	a.server.Start()
}

func (a *App) GetConfig() AppConfig {
	return GlobalConfig
}

func (a *App) SaveConfig(config AppConfig) {
	GlobalConfig = config
	saveConfig()
}

func (a *App) Logf(format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)
	fmt.Print(msg)
	if a.wailsApp != nil {
		a.wailsApp.Event.Emit("log", msg)
	}
}

// AddDownload is called by the server.go when a new download request arrives
func (a *App) AddDownload(url, typ, size, pageUrl string) {
	a.Logf("New download request: %s (from %s)\n", url, pageUrl)
	
	item := DownloadItem{
		ID:      fmt.Sprintf("%d", len(a.downloads)+1),
		URL:     url,
		Type:    typ,
		Size:    size,
		Status:  "pending",
		PageURL: pageUrl,
	}
	
	a.downloads = append(a.downloads, item)

	if a.wailsApp != nil {
		a.wailsApp.Event.Emit("new_download", item)
	}

	if a.mainWindow != nil {
		a.mainWindow.Show()
		a.mainWindow.Focus()
	}

	// Auto-start download
	a.StartDownloadProcess(item.ID, url)
}

// GetDownloads is exposed to frontend
func (a *App) GetDownloads() []DownloadItem {
	return a.downloads
}

// CancelDownload kills the process associated with the given download ID
func (a *App) CancelDownload(id string) {
	a.mu.Lock()
	defer a.mu.Unlock()

	if cancel, exists := a.cancelFuncs[id]; exists {
		a.Logf("Cancelling download %s\n", id)
		cancel()
		delete(a.cancelFuncs, id)
	}

	for i, item := range a.downloads {
		if item.ID == id && (item.Status == "pending" || item.Status == "downloading") {
			a.downloads[i].Status = "cancelled"
			if a.wailsApp != nil {
				a.wailsApp.Event.Emit("download_updated", a.downloads[i])
			}
			break
		}
	}
}
