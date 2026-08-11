package main

import (
	"vdm/internal/config"
	"vdm/internal/db"
	"vdm/internal/downloader"
	"vdm/internal/models"
	"vdm/internal/server"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type App struct {
	store   *db.Store
	manager *downloader.Manager
	server  *server.Server
}

func NewApp() *App {
	store := db.NewStore()
	mgr := downloader.NewManager(store)
	srv := server.NewServer(mgr)
	return &App{
		store:   store,
		manager: mgr,
		server:  srv,
	}
}

func (a *App) SetWailsApp(wailsApp *application.App) {
	a.manager.SetWailsApp(wailsApp)
}

func (a *App) SetWindow(w *application.WebviewWindow) {
	a.manager.SetWindow(w)
}

func (a *App) StartServer() {
	a.server.Start()
}

func (a *App) GetConfig() config.AppConfig {
	return config.GlobalConfig
}

func (a *App) SaveConfig(cfg config.AppConfig) {
	config.GlobalConfig = cfg
	config.SaveConfig()
}

func (a *App) ClearTerminalLogs() {
	a.manager.ClearTerminalLogs()
}

func (a *App) GetTerminalLogs() []string {
	return a.manager.GetTerminalLogs()
}

func (a *App) GetDownloadLogs(downloadID string) []string {
	return a.manager.GetDownloadLogs(downloadID)
}

func (a *App) GetYouTubeFormats(u string) ([]models.YouTubeFormat, error) {
	return downloader.GetYouTubeFormats(u, a.manager.Logf)
}

func (a *App) SetDownloadFormat(id string, formatId string) {
	a.manager.SetDownloadFormat(id, formatId)
}

func (a *App) AddDownload(url, typ, size, pageUrl, title, formatId string) {
	a.manager.AddDownload(url, typ, size, pageUrl, title, formatId)
}

func (a *App) GetDownloads() []models.DownloadItem {
	return a.manager.GetDownloads()
}

func (a *App) ShowInFolder(id string) {
	a.manager.ShowInFolder(id)
}

func (a *App) PauseDownload(id string) {
	a.manager.PauseDownload(id)
}

func (a *App) RemoveDownload(id string, deleteFile bool) {
	a.manager.RemoveDownload(id, deleteFile)
}

func (a *App) ResumeDownload(id string) {
	a.manager.ResumeDownload(id)
}

func (a *App) RetryDownload(id string) {
	a.manager.RetryDownload(id)
}

func (a *App) CancelDownload(id string) {
	a.manager.CancelDownload(id)
}
