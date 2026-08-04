package main

import (
	"fmt"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type DownloadItem struct {
	ID     string `json:"id"`
	URL    string `json:"url"`
	Type   string `json:"type"`
	Size   string `json:"size"`
	Status string `json:"status"` // "pending", "downloading", "completed", "error"
}

type App struct {
	wailsApp  *application.App
	server    *Server
	downloads []DownloadItem
}

func NewApp() *App {
	app := &App{
		downloads: []DownloadItem{},
	}
	app.server = NewServer(app)
	return app
}

func (a *App) SetWailsApp(wailsApp *application.App) {
	a.wailsApp = wailsApp
}

func (a *App) StartServer() {
	a.server.Start()
}

// AddDownload is called by the server.go when a new download request arrives
func (a *App) AddDownload(url, typ, size string) {
	fmt.Printf("New download request: %s\n", url)
	
	item := DownloadItem{
		ID:     fmt.Sprintf("%d", len(a.downloads)+1),
		URL:    url,
		Type:   typ,
		Size:   size,
		Status: "pending",
	}
	
	a.downloads = append(a.downloads, item)

	if a.wailsApp != nil {
		a.wailsApp.Event.Emit("new_download", item)
	}

	// Auto-start download
	a.StartDownloadProcess(item.ID, url)
}

// GetDownloads is exposed to frontend
func (a *App) GetDownloads() []DownloadItem {
	return a.downloads
}
