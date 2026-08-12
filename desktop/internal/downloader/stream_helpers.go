package downloader

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func splitCRLF(data []byte, atEOF bool) (advance int, token []byte, err error) {
	if atEOF && len(data) == 0 {
		return 0, nil, nil
	}
	if i := bytes.IndexAny(data, "\r\n"); i >= 0 {
		return i + 1, data[0:i], nil
	}
	if atEOF {
		return len(data), data, nil
	}
	return 0, nil, nil
}

func extractStatusMsg(text string) string {
	if strings.Contains(text, "status=429") || strings.Contains(text, "Too Many Requests") {
		return "Rate limited (HTTP 429), retrying..."
	}
	if strings.Contains(text, "status=403") || strings.Contains(text, "HTTP 403") || strings.Contains(text, "Forbidden") {
		return "HTTP 403 Forbidden (aria2c error)"
	}
	if strings.HasPrefix(text, "ERROR:") || strings.HasPrefix(text, "[ERROR]") || strings.Contains(text, "ERROR:") || strings.Contains(text, "errorCode=") {
		if idx := strings.Index(text, "ERROR:"); idx != -1 {
			return strings.TrimSpace(text[idx:])
		}
		if idx := strings.Index(text, "errorCode="); idx != -1 {
			return strings.TrimSpace(text[idx:])
		}
		return text
	}
	if strings.HasPrefix(text, "[youtube]") || strings.HasPrefix(text, "[info]") {
		parts := strings.SplitN(text, ":", 2)
		if len(parts) > 1 {
			return strings.TrimSpace(parts[1])
		}
		return text
	}
	if strings.Contains(text, "[NOTICE]") {
		parts := strings.SplitN(text, "[NOTICE]", 2)
		if len(parts) > 1 {
			msg := strings.TrimSpace(parts[1])
			if msg != "" && !strings.HasPrefix(msg, "Shutdown") {
				return msg
			}
		}
	}
	if strings.HasPrefix(text, "[download] Destination:") {
		return "Downloading..."
	}
	if strings.HasPrefix(text, "[download] Writing temporary cookies") {
		return "Writing temporary cookies..."
	}
	if strings.HasPrefix(text, "[Fixup") {
		return "Fixing media container..."
	}
	if strings.HasPrefix(text, "[MoveFiles]") {
		return "Moving file to Downloads..."
	}
	if strings.HasPrefix(text, "[Merger]") {
		return "Merging audio & video..."
	}
	return ""
}

func (m *Manager) updateItemStatusMsg(id string, stMsg string) {
	if stMsg == "" {
		return
	}
	m.mu.Lock()
	for i, item := range m.downloads {
		if item.ID == id {
			if item.Status == "paused" || item.Status == "cancelled" || item.Status == "completed" {
				m.mu.Unlock()
				return
			}
			m.downloads[i].StatusMsg = stMsg
			if strings.HasPrefix(stMsg, "ERROR:") || strings.HasPrefix(stMsg, "HTTP 403") {
				m.downloads[i].Status = "error"
				m.downloads[i].Speed = ""
			}
			if m.wailsApp != nil {
				m.wailsApp.Event.Emit("download_updated", m.downloads[i])
			}
			break
		}
	}
	m.mu.Unlock()
}

func (m *Manager) finalizeDownloadStatus(id string, downloadUrl string, err error) {
	m.mu.Lock()
	itemIndex := -1
	for i, item := range m.downloads {
		if item.ID == id {
			itemIndex = i
			break
		}
	}

	if itemIndex != -1 {
		if m.downloads[itemIndex].StartedAt > 0 {
			m.downloads[itemIndex].ElapsedSecs += (time.Now().UnixMilli() - m.downloads[itemIndex].StartedAt) / 1000
			m.downloads[itemIndex].StartedAt = 0
		}

		if m.downloads[itemIndex].Status == "cancelled" || m.downloads[itemIndex].Status == "paused" {
			m.mu.Unlock()
			return
		}

		if err != nil {
			m.Logf("Download error for %s: %v\n", downloadUrl, err)
			m.downloads[itemIndex].Status = "error"
			m.downloads[itemIndex].StatusMsg = fmt.Sprintf("Error: %v", err)
			m.downloads[itemIndex].Speed = ""
		} else {
			m.Logf("Download completed for %s\n", downloadUrl)
			m.downloads[itemIndex].Status = "completed"
			m.downloads[itemIndex].StatusMsg = "Completed"
			m.downloads[itemIndex].Progress = 100.0
			m.downloads[itemIndex].Speed = ""

			dest := m.downloads[itemIndex].Destination
			downloadDir := GetDownloadDir()
			if dest == "" || strings.Contains(dest, ".vdm/temp") {
				baseName := filepath.Base(dest)
				if baseName == "" || baseName == "." {
					baseName = SanitizeFilename(m.downloads[itemIndex].Title) + ".mp4"
				}
				finalPath := filepath.Join(downloadDir, baseName)
				if _, statErr := os.Stat(finalPath); statErr == nil {
					m.downloads[itemIndex].Destination = finalPath
				} else {
					files, _ := os.ReadDir(downloadDir)
					stem := strings.TrimSuffix(baseName, filepath.Ext(baseName))
					for _, f := range files {
						if stem != "" && strings.HasPrefix(f.Name(), stem) {
							m.downloads[itemIndex].Destination = filepath.Join(downloadDir, f.Name())
							break
						}
					}
				}
			}
		}

		if m.wailsApp != nil {
			m.wailsApp.Event.Emit("download_updated", m.downloads[itemIndex])
		}
	}
	m.mu.Unlock()
	m.SaveHistory()
}
