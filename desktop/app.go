package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type DownloadItem struct {
	ID             string  `json:"id"`
	URL            string  `json:"url"`
	Type           string  `json:"type"`
	Size           string  `json:"size"`
	Status         string  `json:"status"` // "pending", "downloading", "paused", "completed", "error", "cancelled"
	PageURL        string  `json:"pageUrl"`
	Destination    string  `json:"destination,omitempty"` // The path to the file on disk
	Title          string  `json:"title"`
	FormatID       string  `json:"formatId,omitempty"`  // Selected format ID e.g. "137+bestaudio" or "140"
	StatusMsg      string  `json:"statusMsg,omitempty"` // Short live status line e.g. "Downloading webpage", "Moving file..."
	Progress       float64 `json:"progress,omitempty"`
	Speed          string  `json:"speed"`
	DownloadedSize string  `json:"downloadedSize,omitempty"`
	TotalSize      string  `json:"totalSize,omitempty"`
}

type YouTubeFormat struct {
	FormatID   string  `json:"formatId"`
	Ext        string  `json:"ext"`
	Resolution string  `json:"resolution"`
	FPS        float64 `json:"fps"`
	Filesize   int64   `json:"filesize"`
	TBR        float64 `json:"tbr"`
	VCodec     string  `json:"vcodec"`
	ACodec     string  `json:"acodec"`
	FormatNote string  `json:"formatNote"`
	Format     string  `json:"format"`
}

type rawYtdlpFormat struct {
	FormatID       string   `json:"format_id"`
	Ext            string   `json:"ext"`
	Resolution     string   `json:"resolution"`
	FPS            *float64 `json:"fps"`
	Filesize       *int64   `json:"filesize"`
	FilesizeApprox *int64   `json:"filesize_approx"`
	TBR            *float64 `json:"tbr"`
	VCodec         string   `json:"vcodec"`
	ACodec         string   `json:"acodec"`
	FormatNote     string   `json:"format_note"`
	Format         string   `json:"format"`
}

type rawYtdlpInfo struct {
	Formats []rawYtdlpFormat `json:"formats"`
}

type App struct {
	wailsApp     *application.App
	mainWindow   *application.WebviewWindow
	server       *Server
	downloads    []DownloadItem
	cancelFuncs  map[string]context.CancelFunc
	terminalLogs []string
	mu           sync.Mutex
	db           *sql.DB
}

func NewApp() *App {
	app := &App{
		downloads:    []DownloadItem{},
		cancelFuncs:   make(map[string]context.CancelFunc),
		terminalLogs: []string{},
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
		title TEXT,
		formatId TEXT,
		statusMsg TEXT,
		progress REAL DEFAULT 0,
		speed TEXT DEFAULT '',
		downloadedSize TEXT DEFAULT '',
		totalSize TEXT DEFAULT ''
	);

	CREATE TABLE IF NOT EXISTS download_logs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		download_id TEXT,
		message TEXT
	);

	CREATE TABLE IF NOT EXISTS terminal_logs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		message TEXT
	);
	`
	_, err = db.Exec(createTableQuery)
	if err != nil {
		log.Fatalf("Failed to create downloads table: %v", err)
	}

	// Migrate if columns are missing from previous versions
	db.Exec("ALTER TABLE downloads ADD COLUMN formatId TEXT;")
	db.Exec("ALTER TABLE downloads ADD COLUMN statusMsg TEXT;")
	db.Exec("ALTER TABLE downloads ADD COLUMN progress REAL DEFAULT 0;")
	db.Exec("ALTER TABLE downloads ADD COLUMN speed TEXT DEFAULT '';")
	db.Exec("ALTER TABLE downloads ADD COLUMN downloadedSize TEXT DEFAULT '';")
	db.Exec("ALTER TABLE downloads ADD COLUMN totalSize TEXT DEFAULT '';")
}

func (a *App) loadHistory() {
	if a.db == nil {
		return
	}
	
	rows, err := a.db.Query(`
		SELECT id, url, type, size, status, pageUrl, destination, title, 
		       COALESCE(formatId, ''), COALESCE(statusMsg, ''),
		       COALESCE(progress, 0), COALESCE(speed, ''),
		       COALESCE(downloadedSize, ''), COALESCE(totalSize, '')
		FROM downloads
	`)
	if err != nil {
		a.Logf("Error loading history from sqlite: %v\n", err)
		return
	}
	defer rows.Close()

	var items []DownloadItem
	for rows.Next() {
		var i DownloadItem
		err = rows.Scan(&i.ID, &i.URL, &i.Type, &i.Size, &i.Status, &i.PageURL, &i.Destination, &i.Title, &i.FormatID, &i.StatusMsg, &i.Progress, &i.Speed, &i.DownloadedSize, &i.TotalSize)
		if err != nil {
			a.Logf("Error scanning row: %v\n", err)
			continue
		}
		
		// Reset states: pending or downloading -> paused
		if i.Status == "downloading" || i.Status == "pending" {
			i.Status = "paused"
		} else if i.Status == "completed" {
			i.Progress = 100
			i.StatusMsg = "Completed"
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
		INSERT INTO downloads (id, url, type, size, status, pageUrl, destination, title, formatId, statusMsg, progress, speed, downloadedSize, totalSize) 
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			status=excluded.status,
			destination=excluded.destination,
			title=excluded.title,
			size=excluded.size,
			formatId=excluded.formatId,
			statusMsg=excluded.statusMsg,
			progress=excluded.progress,
			speed=excluded.speed,
			downloadedSize=excluded.downloadedSize,
			totalSize=excluded.totalSize
	`)
	
	if err != nil {
		a.Logf("Error preparing statement: %v\n", err)
		tx.Rollback()
		return
	}
	defer stmt.Close()

	for _, i := range items {
		_, err = stmt.Exec(i.ID, i.URL, i.Type, i.Size, i.Status, i.PageURL, i.Destination, i.Title, i.FormatID, i.StatusMsg, i.Progress, i.Speed, i.DownloadedSize, i.TotalSize)
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
	timestamp := time.Now().Format("15:04:05")
	msg := fmt.Sprintf("[%s] ", timestamp) + fmt.Sprintf(format, args...)
	fmt.Print(msg)

	a.mu.Lock()
	a.terminalLogs = append(a.terminalLogs, msg)
	if len(a.terminalLogs) > 2000 {
		a.terminalLogs = a.terminalLogs[len(a.terminalLogs)-2000:]
	}
	a.mu.Unlock()

	if a.db != nil {
		a.db.Exec("INSERT INTO terminal_logs (message) VALUES (?)", msg)
	}

	if a.wailsApp != nil {
		a.wailsApp.Event.Emit("log", msg)
	}
}

func (a *App) SaveDownloadLog(downloadID string, msg string) {
	if a.db != nil {
		a.db.Exec("INSERT INTO download_logs (download_id, message) VALUES (?, ?)", downloadID, msg)
	}
}

func (a *App) ClearTerminalLogs() {
	a.mu.Lock()
	a.terminalLogs = nil
	a.mu.Unlock()
	if a.db != nil {
		a.db.Exec("DELETE FROM terminal_logs")
	}
}

func (a *App) GetTerminalLogs() []string {
	if a.db == nil {
		return a.terminalLogs
	}
	rows, err := a.db.Query("SELECT message FROM terminal_logs ORDER BY id DESC LIMIT 500")
	if err != nil {
		return a.terminalLogs
	}
	defer rows.Close()

	var logs []string
	for rows.Next() {
		var m string
		if err := rows.Scan(&m); err == nil {
			logs = append(logs, m)
		}
	}
	for i, j := 0, len(logs)-1; i < j; i, j = i+1, j-1 {
		logs[i], logs[j] = logs[j], logs[i]
	}
	return logs
}

func (a *App) GetDownloadLogs(downloadID string) []string {
	if a.db == nil {
		return nil
	}
	rows, err := a.db.Query("SELECT message FROM download_logs WHERE download_id = ? ORDER BY id ASC", downloadID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var logs []string
	for rows.Next() {
		var m string
		if err := rows.Scan(&m); err == nil {
			logs = append(logs, m)
		}
	}
	return logs
}

// GetYouTubeFormats fetches format list for YouTube videos using yt-dlp --dump-single-json
func (a *App) GetYouTubeFormats(u string) ([]YouTubeFormat, error) {
	ytdlpPath := GetDependencyPath("yt-dlp")
	a.Logf("Fetching YouTube formats for: %s\n", u)
	cmd := exec.Command(ytdlpPath, "--dump-single-json", "--no-playlist", "--js-runtimes", "node", u)
	var out bytes.Buffer
	var errOut bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errOut

	if err := cmd.Run(); err != nil {
		a.Logf("GetYouTubeFormats error: %v, stderr: %s\n", err, errOut.String())
		return nil, fmt.Errorf("yt-dlp failed: %w", err)
	}

	var info rawYtdlpInfo
	if err := json.Unmarshal(out.Bytes(), &info); err != nil {
		a.Logf("GetYouTubeFormats JSON parse error: %v\n", err)
		return nil, fmt.Errorf("failed to parse yt-dlp json: %w", err)
	}

	var formats []YouTubeFormat
	for _, f := range info.Formats {
		size := int64(0)
		if f.Filesize != nil && *f.Filesize > 0 {
			size = *f.Filesize
		} else if f.FilesizeApprox != nil && *f.FilesizeApprox > 0 {
			size = *f.FilesizeApprox
		}

		fpsVal := float64(0)
		if f.FPS != nil {
			fpsVal = *f.FPS
		}

		tbrVal := float64(0)
		if f.TBR != nil {
			tbrVal = *f.TBR
		}

		res := f.Resolution
		if res == "" {
			if f.VCodec != "none" && f.VCodec != "" {
				res = "video"
			} else {
				res = "audio only"
			}
		}

		formats = append(formats, YouTubeFormat{
			FormatID:   f.FormatID,
			Ext:        f.Ext,
			Resolution: res,
			FPS:        fpsVal,
			Filesize:   size,
			TBR:        tbrVal,
			VCodec:     f.VCodec,
			ACodec:     f.ACodec,
			FormatNote: f.FormatNote,
			Format:     f.Format,
		})
	}
	a.Logf("Found %d formats for %s\n", len(formats), u)
	return formats, nil
}

// SetDownloadFormat updates format choice for a download
func (a *App) SetDownloadFormat(id string, formatId string) {
	a.mu.Lock()
	for i, item := range a.downloads {
		if item.ID == id {
			a.downloads[i].FormatID = formatId
			if a.wailsApp != nil {
				a.wailsApp.Event.Emit("download_updated", a.downloads[i])
			}
			break
		}
	}
	a.mu.Unlock()
	a.saveHistory()
}

// AddDownload is called by the server.go or frontend when a new download request arrives
func (a *App) AddDownload(url, typ, size, pageUrl, title, formatId string) {
	a.Logf("New download request: %s (from %s, title: %s, format: %s)\n", url, pageUrl, title, formatId)

	status := "pending"
	if isYouTube(url) && formatId == "" {
		status = "paused"
	}

	item := DownloadItem{
		ID:       fmt.Sprintf("%d", time.Now().UnixNano()),
		URL:      url,
		Type:     typ,
		Size:     size,
		Status:   status,
		PageURL:  pageUrl,
		Title:    title,
		FormatID: formatId,
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

	// Auto-start download if not waiting for YouTube format selection
	if !isYouTube(url) || formatId != "" {
		a.StartDownloadProcess(item.ID, url)
	}
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
			dest := item.Destination
			downloadDir := getDownloadDir()
			if dest == "" || strings.Contains(dest, ".vdm/temp") {
				if dest != "" {
					baseName := filepath.Base(dest)
					possiblePath := filepath.Join(downloadDir, baseName)
					if _, err := os.Stat(possiblePath); err == nil {
						dest = possiblePath
					} else {
						dest = downloadDir
					}
				} else {
					dest = downloadDir
				}
			}

			if dest != "" {
				dir := dest
				if fi, err := os.Stat(dest); err == nil && !fi.IsDir() {
					dir = filepath.Dir(dest)
				}
				switch runtime.GOOS {
				case "windows":
					exec.Command("explorer", "/select,", dest).Start()
				case "darwin":
					exec.Command("open", "-R", dest).Start()
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

	wasRunning := false
	if cancel, exists := a.cancelFuncs[id]; exists {
		cancel()
		delete(a.cancelFuncs, id)
		wasRunning = true
	}

	ts := time.Now().Format("15:04:05")
	logMsg := fmt.Sprintf("[%s] Download paused", ts)

	var title string
	for i, item := range a.downloads {
		if item.ID == id && (wasRunning || item.Status == "downloading" || item.Status == "pending") {
			a.downloads[i].Status = "paused"
			a.downloads[i].Speed = ""
			a.downloads[i].StatusMsg = "Paused"
			title = item.Title
			if title == "" { title = item.URL }
			if a.wailsApp != nil {
				a.wailsApp.Event.Emit("download_updated", a.downloads[i])
				a.wailsApp.Event.Emit("download_log", map[string]string{
					"id":      id,
					"message": logMsg,
				})
			}
			break
		}
	}
	a.mu.Unlock()

	a.Logf("Paused download %s (%s)\n", id, title)
	a.SaveDownloadLog(id, logMsg)
	a.saveHistory()
}

// RemoveDownload deletes the download completely from the list and database
func (a *App) RemoveDownload(id string, deleteFile bool) {
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
		a.downloads = append(a.downloads[:indexToRemove], a.downloads[indexToRemove+1:]...)
	}
	a.mu.Unlock()

	if deleteFile && fileToDelete != "" {
		a.Logf("Deleting file for removed download: %s\n", fileToDelete)
		os.Remove(fileToDelete)
		os.Remove(fileToDelete + ".part")
		os.Remove(fileToDelete + ".ytdl")
		os.Remove(fileToDelete + ".aria2")

		downloadDir := getDownloadDir()
		baseName := filepath.Base(fileToDelete)
		if baseName != "" && baseName != "." {
			finalPath := filepath.Join(downloadDir, baseName)
			os.Remove(finalPath)
			os.Remove(finalPath + ".part")
			os.Remove(finalPath + ".ytdl")
			os.Remove(finalPath + ".aria2")
		}
	}

	if a.db != nil {
		_, err := a.db.Exec("DELETE FROM downloads WHERE id = ?", id)
		if err != nil {
			a.Logf("Error deleting from db: %v\n", err)
		}
		a.db.Exec("DELETE FROM download_logs WHERE download_id = ?", id)
	}

	if a.wailsApp != nil {
		a.wailsApp.Event.Emit("download_removed", id)
	}
	a.saveHistory()
}

// ResumeDownload re-starts a paused download
func (a *App) ResumeDownload(id string) {
	a.mu.Lock()
	var targetUrl string
	var title string
	for i, item := range a.downloads {
		if item.ID == id && (item.Status == "paused" || item.Status == "pending" || item.Status == "error" || item.Status == "cancelled") {
			a.downloads[i].Status = "pending"
			a.downloads[i].StatusMsg = "Resuming..."
			targetUrl = item.URL
			title = item.Title
			if title == "" { title = item.URL }
			if a.wailsApp != nil {
				a.wailsApp.Event.Emit("download_updated", a.downloads[i])
			}
			break
		}
	}
	a.mu.Unlock()
	a.saveHistory()

	if targetUrl != "" {
		ts := time.Now().Format("15:04:05")
		logMsg := fmt.Sprintf("[%s] Download resumed", ts)
		a.Logf("Resuming download %s (%s)\n", id, title)
		a.SaveDownloadLog(id, logMsg)
		if a.wailsApp != nil {
			a.wailsApp.Event.Emit("download_log", map[string]string{
				"id":      id,
				"message": logMsg,
			})
		}
		a.StartDownloadProcess(id, targetUrl)
	}
}

// RetryDownload re-starts an errored or cancelled download
func (a *App) RetryDownload(id string) {
	a.mu.Lock()
	var targetUrl string
	var title string
	for i, item := range a.downloads {
		if item.ID == id && (item.Status == "error" || item.Status == "cancelled" || item.Status == "paused") {
			a.downloads[i].Status = "pending"
			a.downloads[i].StatusMsg = "Retrying..."
			targetUrl = item.URL
			title = item.Title
			if title == "" { title = item.URL }
			if a.wailsApp != nil {
				a.wailsApp.Event.Emit("download_updated", a.downloads[i])
			}
			break
		}
	}
	a.mu.Unlock()
	a.saveHistory()

	if targetUrl != "" {
		ts := time.Now().Format("15:04:05")
		logMsg := fmt.Sprintf("[%s] Download retried", ts)
		a.Logf("Retrying download %s (%s)\n", id, title)
		a.SaveDownloadLog(id, logMsg)
		if a.wailsApp != nil {
			a.wailsApp.Event.Emit("download_log", map[string]string{
				"id":      id,
				"message": logMsg,
			})
		}
		a.StartDownloadProcess(id, targetUrl)
	}
}

// CancelDownload kills the process and deletes the downloaded files
func (a *App) CancelDownload(id string) {
	a.mu.Lock()
	if cancel, exists := a.cancelFuncs[id]; exists {
		cancel()
		delete(a.cancelFuncs, id)
	}

	var fileToDelete string
	var itemFound bool
	var title string
	for i, item := range a.downloads {
		if item.ID == id {
			itemFound = true
			title = item.Title
			if title == "" { title = item.URL }
			if item.Status != "completed" {
				a.downloads[i].Status = "cancelled"
				a.downloads[i].StatusMsg = "Cancelled"
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

	ts := time.Now().Format("15:04:05")
	logMsg := fmt.Sprintf("[%s] Download cancelled", ts)
	a.Logf("Cancelling download %s (%s)\n", id, title)
	a.SaveDownloadLog(id, logMsg)
	if a.wailsApp != nil {
		a.wailsApp.Event.Emit("download_log", map[string]string{
			"id":      id,
			"message": logMsg,
		})
	}

	if itemFound && fileToDelete != "" {
		a.Logf("Deleting partial file for cancelled download: %s\n", fileToDelete)
		os.Remove(fileToDelete)
		os.Remove(fileToDelete + ".part")
		os.Remove(fileToDelete + ".ytdl")
		os.Remove(fileToDelete + ".aria2")
	}
}
