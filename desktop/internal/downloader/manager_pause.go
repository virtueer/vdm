package downloader

import (
	"fmt"
	"time"
)

func (m *Manager) PauseDownload(id string) {
	m.mu.Lock()

	wasRunning := false
	if cancel, exists := m.cancelFuncs[id]; exists {
		cancel()
		delete(m.cancelFuncs, id)
		wasRunning = true
	}

	ts := time.Now().Format("15:04:05")
	logMsg := fmt.Sprintf("[%s] Download paused", ts)

	var title string
	for i, item := range m.downloads {
		if item.ID == id && (wasRunning || item.Status == "downloading" || item.Status == "pending") {
			m.downloads[i].Status = "paused"
			m.downloads[i].Speed = ""
			m.downloads[i].StatusMsg = "Paused"
			if m.downloads[i].StartedAt > 0 {
				m.downloads[i].ElapsedSecs += (time.Now().UnixMilli() - m.downloads[i].StartedAt) / 1000
				m.downloads[i].StartedAt = 0
			}
			title = item.Title
			if title == "" {
				title = item.URL
			}
			if m.wailsApp != nil {
				m.wailsApp.Event.Emit("download_updated", m.downloads[i])
				m.wailsApp.Event.Emit("download_log", map[string]string{
					"id":      id,
					"message": logMsg,
				})
			}
			break
		}
	}
	m.mu.Unlock()

	m.Logf("Paused download %s (%s)\n", id, title)
	m.SaveDownloadLog(id, logMsg)
	m.SaveHistory()
}

func (m *Manager) ResumeDownload(id string) {
	m.mu.Lock()
	var targetUrl string
	var title string
	for i, item := range m.downloads {
		if item.ID == id && (item.Status == "paused" || item.Status == "pending" || item.Status == "error" || item.Status == "cancelled") {
			m.downloads[i].Status = "pending"
			m.downloads[i].StatusMsg = "Resuming..."
			targetUrl = item.URL
			title = item.Title
			if title == "" {
				title = item.URL
			}
			if m.wailsApp != nil {
				m.wailsApp.Event.Emit("download_updated", m.downloads[i])
			}
			break
		}
	}
	m.mu.Unlock()
	m.SaveHistory()

	if targetUrl != "" {
		ts := time.Now().Format("15:04:05")
		logMsg := fmt.Sprintf("[%s] Download resumed", ts)
		m.Logf("Resuming download %s (%s)\n", id, title)
		m.SaveDownloadLog(id, logMsg)
		if m.wailsApp != nil {
			m.wailsApp.Event.Emit("download_log", map[string]string{
				"id":      id,
				"message": logMsg,
			})
		}
		m.StartDownloadProcess(id, targetUrl)
	}
}

func (m *Manager) RetryDownload(id string) {
	m.mu.Lock()
	var targetUrl string
	var title string
	for i, item := range m.downloads {
		if item.ID == id && (item.Status == "error" || item.Status == "cancelled" || item.Status == "paused") {
			m.downloads[i].Status = "pending"
			m.downloads[i].StatusMsg = "Retrying..."
			targetUrl = item.URL
			title = item.Title
			if title == "" {
				title = item.URL
			}
			if m.wailsApp != nil {
				m.wailsApp.Event.Emit("download_updated", m.downloads[i])
			}
			break
		}
	}
	m.mu.Unlock()
	m.SaveHistory()

	if targetUrl != "" {
		ts := time.Now().Format("15:04:05")
		logMsg := fmt.Sprintf("[%s] Download retried", ts)
		m.Logf("Retrying download %s (%s)\n", id, title)
		m.SaveDownloadLog(id, logMsg)
		if m.wailsApp != nil {
			m.wailsApp.Event.Emit("download_log", map[string]string{
				"id":      id,
				"message": logMsg,
			})
		}
		m.StartDownloadProcess(id, targetUrl)
	}
}
