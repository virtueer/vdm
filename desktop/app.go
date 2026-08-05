package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type DownloadItem struct {
	ID          string `json:"id"`
	URL         string `json:"url"`
	Type        string `json:"type"`
	Size        string `json:"size"`
	Status      string `json:"status"` // "pending", "downloading", "paused", "completed", "error", "cancelled"
	PageURL     string `json:"pageUrl"`
	Destination string `json:"destination,omitempty"` // The path to the file on disk
	Title       string `json:"title"`
}

type App struct {
	wailsApp    *application.App
	mainWindow  *application.WebviewWindow
	server      *Server
	downloads   []DownloadItem
	cancelFuncs map[string]context.CancelFunc
	mu          sync.Mutex
	db          *sql.DB
}

func NewApp() *App {
	app := &App{
		downloads:   []DownloadItem{},
		cancelFuncs: make(map[string]context.CancelFunc),
	}
	app.initDB()
	app.loadHistory()
	app.server = NewServer(app)
	return app
}

func (a *App) getHistoryPath() string {
	homeDir, _ := os.UserHomeDir()
	return filepath.Join(homeDir, ".vdm", "downloads.db")
}

func (a *App) initDB() {
	path := a.getHistoryPath()
	os.MkdirAll(filepath.Dir(path), 0755)

	db, err := sql.Open("sqlite3", path)
	if err != nil {
		log.Fatalf("Failed to open sqlite db: %v", err)
	}
	a.db = db

	createTableQuery := `
	CREATE TABLE IF NOT EXISTS downloads (
		id TEXT PRIMARY KEY,
		url TEXT,
		type TEXT,
		size TEXT,
		status TEXT,
		pageUrl TEXT,
		destination TEXT,
		title TEXT
	);
	`
	_, err = db.Exec(createTableQuery)
	if err != nil {
		log.Fatalf("Failed to create downloads table: %v", err)
	}
}

func (a *App) loadHistory() {
	if a.db == nil {
		return
	}
	
	rows, err := a.db.Query("SELECT id, url, type, size, status, pageUrl, destination, title FROM downloads")
	if err != nil {
		a.Logf("Error loading history from sqlite: %v\n", err)
		return
	}
	defer rows.Close()

	var items []DownloadItem
	for rows.Next() {
		var i DownloadItem
		err = rows.Scan(&i.ID, &i.URL, &i.Type, &i.Size, &i.Status, &i.PageURL, &i.Destination, &i.Title)
		if err != nil {
			a.Logf("Error scanning row: %v\n", err)
			continue
		}
		
		// Reset states: pending or downloading -> paused
		if i.Status == "downloading" || i.Status == "pending" {
			i.Status = "paused"
		}
		
		items = append(items, i)
	}
	a.downloads = items
}

func (a *App) saveHistory() {
	if a.db == nil {
		return
	}

	a.mu.Lock()
	items := make([]DownloadItem, len(a.downloads))
	copy(items, a.downloads)
	a.mu.Unlock()

	tx, err := a.db.Begin()
	if err != nil {
		a.Logf("Error starting db transaction: %v\n", err)
		return
	}

	stmt, err := tx.Prepare(`
		INSERT INTO downloads (id, url, type, size, status, pageUrl, destination, title) 
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			status=excluded.status,
			destination=excluded.destination,
			title=excluded.title,
			size=excluded.size
	`)
	
	if err != nil {
		a.Logf("Error preparing statement: %v\n", err)
		tx.Rollback()
		return
	}
	defer stmt.Close()

	for _, i := range items {
		_, err = stmt.Exec(i.ID, i.URL, i.Type, i.Size, i.Status, i.PageURL, i.Destination, i.Title)
		if err != nil {
			a.Logf("Error executing upsert: %v\n", err)
		}
	}
	tx.Commit()
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
func (a *App) AddDownload(url, typ, size, pageUrl, title string) {
	a.Logf("New download request: %s (from %s, title: %s)\n", url, pageUrl, title)

	item := DownloadItem{
		ID:      fmt.Sprintf("%d", time.Now().UnixNano()),
		URL:     url,
		Type:    typ,
		Size:    size,
		Status:  "pending",
		PageURL: pageUrl,
		Title:   title,
	}

	a.downloads = append(a.downloads, item)
	a.saveHistory()

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

// ShowInFolder opens the file explorer and selects the downloaded file
func (a *App) ShowInFolder(id string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	for _, item := range a.downloads {
		if item.ID == id {
			if item.Destination != "" {
				dir := filepath.Dir(item.Destination)
				switch runtime.GOOS {
				case "windows":
					exec.Command("explorer", "/select,", item.Destination).Start()
				case "darwin":
					exec.Command("open", "-R", item.Destination).Start()
				default:
					exec.Command("xdg-open", dir).Start()
				}
			}
			break
		}
	}
}

// PauseDownload kills the current download process but keeps the state so it can be resumed
func (a *App) PauseDownload(id string) {
	a.mu.Lock()
	defer a.mu.Unlock()

	if cancel, exists := a.cancelFuncs[id]; exists {
		a.Logf("Pausing download %s\n", id)
		cancel()
		delete(a.cancelFuncs, id)
	}

	for i, item := range a.downloads {
		if item.ID == id && (item.Status == "downloading" || item.Status == "pending") {
			a.downloads[i].Status = "paused"
			if a.wailsApp != nil {
				a.wailsApp.Event.Emit("download_updated", a.downloads[i])
			}
			break
		}
	}
	a.saveHistory()
}

// RemoveDownload deletes the download completely from the list and database
func (a *App) RemoveDownload(id string) {
	a.mu.Lock()
	if cancel, exists := a.cancelFuncs[id]; exists {
		cancel()
		delete(a.cancelFuncs, id)
	}

	indexToRemove := -1
	var fileToDelete string
	for i, item := range a.downloads {
		if item.ID == id {
			indexToRemove = i
			fileToDelete = item.Destination
			break
		}
	}

	if indexToRemove != -1 {
		// Remove from slice
		a.downloads = append(a.downloads[:indexToRemove], a.downloads[indexToRemove+1:]...)
	}
	a.mu.Unlock()

	// Delete from filesystem
	if fileToDelete != "" {
		a.Logf("Deleting file for removed download: %s\n", fileToDelete)
		os.Remove(fileToDelete)
		os.Remove(fileToDelete + ".part")
		os.Remove(fileToDelete + ".ytdl")
		os.Remove(fileToDelete + ".aria2")
	}

	// Remove from DB
	if a.db != nil {
		_, err := a.db.Exec("DELETE FROM downloads WHERE id = ?", id)
		if err != nil {
			a.Logf("Error deleting from db: %v\n", err)
		}
	}

	if a.wailsApp != nil {
		a.wailsApp.Event.Emit("download_removed", id)
	}
}

// ResumeDownload re-starts a paused download
func (a *App) ResumeDownload(id string) {
	a.mu.Lock()
	var targetUrl string
	for _, item := range a.downloads {
		if item.ID == id && item.Status == "paused" {
			targetUrl = item.URL
			break
		}
	}
	a.mu.Unlock()

	if targetUrl != "" {
		a.Logf("Resuming download %s\n", id)
		a.StartDownloadProcess(id, targetUrl)
	}
}

// RetryDownload re-starts an errored or cancelled download
func (a *App) RetryDownload(id string) {
	a.mu.Lock()
	var targetUrl string
	for i, item := range a.downloads {
		if item.ID == id && (item.Status == "error" || item.Status == "cancelled" || item.Status == "paused") {
			a.downloads[i].Status = "pending"
			targetUrl = item.URL
			if a.wailsApp != nil {
				a.wailsApp.Event.Emit("download_updated", a.downloads[i])
			}
			break
		}
	}
	a.mu.Unlock()
	a.saveHistory()

	if targetUrl != "" {
		a.Logf("Retrying download %s\n", id)
		a.StartDownloadProcess(id, targetUrl)
	}
}

// CancelDownload kills the process and deletes the downloaded files
func (a *App) CancelDownload(id string) {
	a.mu.Lock()
	if cancel, exists := a.cancelFuncs[id]; exists {
		a.Logf("Cancelling download %s\n", id)
		cancel()
		delete(a.cancelFuncs, id)
	}

	var fileToDelete string
	var itemFound bool
	for i, item := range a.downloads {
		if item.ID == id {
			itemFound = true
			if item.Status != "completed" {
				a.downloads[i].Status = "cancelled"
				fileToDelete = item.Destination
				if a.wailsApp != nil {
					a.wailsApp.Event.Emit("download_updated", a.downloads[i])
				}
			}
			break
		}
	}
	a.mu.Unlock()
	a.saveHistory()

	// Delete file if the download was not completed
	if itemFound && fileToDelete != "" {
		a.Logf("Deleting partial file for cancelled download: %s\n", fileToDelete)
		// yt-dlp creates .part or .ytdl files, so we might need to delete those as well
		os.Remove(fileToDelete)
		os.Remove(fileToDelete + ".part")
		os.Remove(fileToDelete + ".ytdl")
		// For aria2c, it creates an .aria2 file
		os.Remove(fileToDelete + ".aria2")
	}
}
