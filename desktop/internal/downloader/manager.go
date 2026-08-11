package downloader

import (
	"context"
	"fmt"
	"sync"
	"time"
	"vdm/internal/db"
	"vdm/internal/models"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type Manager struct {
	wailsApp     *application.App
	mainWindow   *application.WebviewWindow
	store        *db.Store
	downloads    []models.DownloadItem
	cancelFuncs  map[string]context.CancelFunc
	terminalLogs []string
	mu           sync.Mutex
}

func NewManager(store *db.Store) *Manager {
	m := &Manager{
		store:       store,
		downloads:   []models.DownloadItem{},
		cancelFuncs: make(map[string]context.CancelFunc),
	}
	if store != nil {
		m.downloads = store.LoadHistory()
	}
	return m
}

func (m *Manager) SetWailsApp(w *application.App) {
	m.wailsApp = w
}

func (m *Manager) SetWindow(w *application.WebviewWindow) {
	m.mainWindow = w
}

func (m *Manager) GetDownloads() []models.DownloadItem {
	m.mu.Lock()
	defer m.mu.Unlock()
	res := make([]models.DownloadItem, len(m.downloads))
	copy(res, m.downloads)
	return res
}

func (m *Manager) SaveHistory() {
	if m.store != nil {
		m.mu.Lock()
		items := make([]models.DownloadItem, len(m.downloads))
		copy(items, m.downloads)
		m.mu.Unlock()
		m.store.SaveHistory(items)
	}
}

func (m *Manager) Logf(format string, args ...interface{}) {
	timestamp := time.Now().Format("15:04:05")
	msg := fmt.Sprintf("[%s] ", timestamp) + fmt.Sprintf(format, args...)
	fmt.Print(msg)

	m.mu.Lock()
	m.terminalLogs = append(m.terminalLogs, msg)
	if len(m.terminalLogs) > 2000 {
		m.terminalLogs = m.terminalLogs[len(m.terminalLogs)-2000:]
	}
	m.mu.Unlock()

	if m.store != nil {
		m.store.SaveTerminalLog(msg)
	}

	if m.wailsApp != nil {
		m.wailsApp.Event.Emit("log", msg)
	}
}

func (m *Manager) SaveDownloadLog(downloadID string, msg string) {
	if m.store != nil {
		m.store.SaveDownloadLog(downloadID, msg)
	}
}

func (m *Manager) ClearTerminalLogs() {
	m.mu.Lock()
	m.terminalLogs = nil
	m.mu.Unlock()
	if m.store != nil {
		m.store.ClearTerminalLogs()
	}
}

func (m *Manager) GetTerminalLogs() []string {
	if m.store == nil {
		return m.terminalLogs
	}
	return m.store.GetTerminalLogs(m.terminalLogs)
}

func (m *Manager) GetDownloadLogs(downloadID string) []string {
	if m.store == nil {
		return nil
	}
	return m.store.GetDownloadLogs(downloadID)
}
