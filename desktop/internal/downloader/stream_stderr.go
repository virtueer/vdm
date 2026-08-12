package downloader

import (
	"bufio"
	"fmt"
	"io"
	"strings"
	"time"
)

func (m *Manager) scanStderrStream(id string, stderr io.ReadCloser, lastEmitMs *int64) {
	scanner := bufio.NewScanner(stderr)
	buf := make([]byte, 64*1024)
	scanner.Buffer(buf, 1024*1024)
	scanner.Split(splitCRLF)
	for scanner.Scan() {
		text := strings.TrimSpace(scanner.Text())
		text = AnsiRegex.ReplaceAllString(text, "")
		text = strings.TrimSpace(text)
		if text == "" {
			continue
		}
		isProgress := ParseProgressLine(id, text, lastEmitMs, func(pct float64, speed, dlSize, totSize string) {
			m.mu.Lock()
			for i, item := range m.downloads {
				if item.ID == id {
					if item.Status == "paused" || item.Status == "cancelled" || item.Status == "completed" || item.Status == "error" {
						m.mu.Unlock()
						return
					}
					if pct >= m.downloads[i].Progress {
						m.downloads[i].Progress = pct
					}
					if m.downloads[i].StatusMsg == "" || m.downloads[i].StatusMsg == "Writing temporary cookies..." || m.downloads[i].StatusMsg == "Resuming..." || m.downloads[i].StatusMsg == "Retrying..." || m.downloads[i].StatusMsg == "Paused" || m.downloads[i].StatusMsg == "Pending" {
						m.downloads[i].StatusMsg = "Downloading..."
					}
					if speed != "" {
						m.downloads[i].Speed = speed
					}
					if dlSize != "" {
						m.downloads[i].DownloadedSize = dlSize
					}
					if totSize != "" {
						m.downloads[i].TotalSize = totSize
					}
					if m.wailsApp != nil {
						m.wailsApp.Event.Emit("download_updated", m.downloads[i])
					}
					break
				}
			}
			m.mu.Unlock()
		}, func(payload map[string]interface{}) {
			m.mu.Lock()
			isInactive := false
			for _, item := range m.downloads {
				if item.ID == id {
					if item.Status == "paused" || item.Status == "cancelled" || item.Status == "completed" || item.Status == "error" {
						isInactive = true
					}
					payload["percentage"] = fmt.Sprintf("%.1f", item.Progress)
					break
				}
			}
			m.mu.Unlock()

			if !isInactive && m.wailsApp != nil {
				m.wailsApp.Event.Emit("download_progress", payload)
			}
		})

		if !isProgress && !strings.Contains(text, "Retrying fragment") {
			ts := time.Now().Format("15:04:05")
			logMsg := fmt.Sprintf("[%s] %s", ts, text)
			m.Logf("%s\n", text)
			m.SaveDownloadLog(id, logMsg)
			m.updateItemStatusMsg(id, extractStatusMsg(text))
			if m.wailsApp != nil {
				m.wailsApp.Event.Emit("download_log", map[string]string{
					"id":      id,
					"message": logMsg,
				})
			}
		}
	}
}
