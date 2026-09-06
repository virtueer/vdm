package main

import (
	"github.com/wailsapp/wails/v3/pkg/application"
)

type App struct {
	manager *Manager
	server  *Server
}

func NewApp() *App {
	mgr := NewManager()
	srv := NewServer(mgr)
	return &App{
		manager: mgr,
		server:  srv,
	}
}

func (a *App) SetWailsApp(w *application.App) {
	a.manager.SetWailsApp(w)
}

func (a *App) SetWindow(w *application.WebviewWindow) {
	a.manager.SetWindow(w)
}

func (a *App) StartServer() {
	a.server.Start()
}

func (a *App) GetDownloads() []DownloadItem {
	return a.manager.GetDownloads()
}

func (a *App) AddDownload(urlStr, title string) string {
	return a.manager.AddDownload(urlStr, title)
}

func (a *App) PauseDownload(id string) {
	a.manager.PauseDownload(id)
}

func (a *App) ResumeDownload(id string) {
	a.manager.ResumeDownload(id)
}

func (a *App) RemoveDownload(id string, deleteFile bool) {
	a.manager.RemoveDownload(id, deleteFile)
}

func (a *App) ShowInFolder(id string) {
	a.manager.ShowInFolder(id)
}
