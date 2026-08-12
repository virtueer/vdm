package downloader

import (
	"bufio"
	"fmt"
	"io"
	"path/filepath"
	"strings"
	"time"
)

func (m *Manager) scanStdoutStream(id string, stdout io.ReadCloser, lastEmitMs *int64, moveFilesChan chan<- struct{}) {
	scanner := bufio.NewScanner(stdout)
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

		var destFile string
		isFinalMove := false

		if strings.HasPrefix(text, "[MoveFiles]") {
			isFinalMove = true
			if idx := strings.Index(text, " to "); idx != -1 {
				destFile = strings.Trim(strings.TrimSpace(text[idx+4:]), "\"")
			}
		} else if strings.Contains(text, "has already been downloaded") {
			isFinalMove = true
			if idx := strings.Index(text, "[download] "); idx != -1 {
				rest := text[idx+11:]
				if endIdx := strings.Index(rest, " has already been downloaded"); endIdx != -1 {
					destFile = strings.TrimSpace(rest[:endIdx])
				}
			}
		} else if match := YtDlpDestRegex.FindStringSubmatch(text); match != nil {
			destFile = strings.TrimSpace(match[1])
		} else if match := YtDlpMergerRegex.FindStringSubmatch(text); match != nil {
			destFile = strings.TrimSpace(match[1])
		}

		if isFinalMove && moveFilesChan != nil {
			select {
			case moveFilesChan <- struct{}{}:
			default:
			}
		}

		if destFile != "" {
			m.mu.Lock()
			for i, item := range m.downloads {
				if item.ID == id {
					m.downloads[i].Destination = destFile
					base := filepath.Base(destFile)
					ext := filepath.Ext(base)
					titleFromDest := strings.TrimSuffix(base, ext)
					if m.downloads[i].Title == "" || m.downloads[i].Title == "Video" || m.downloads[i].Title == "YouTube Video" {
						m.downloads[i].Title = titleFromDest
					}
					if m.wailsApp != nil {
						m.wailsApp.Event.Emit("download_updated", m.downloads[i])
					}
					break
				}
			}
			m.mu.Unlock()
			m.SaveHistory()
		}

		isProgress := ParseProgressLine(id, text, lastEmitMs, func(pct float64, speed, dlSize, totSize string) {
			m.mu.Lock()
			var saveNeeded bool
			for i, item := range m.downloads {
				if item.ID == id {
					if item.Status == "paused" || item.Status == "cancelled" || item.Status == "completed" || item.Status == "error" {
						m.mu.Unlock()
						return
					}
					if pct >= m.downloads[i].Progress {
						m.downloads[i].Progress = pct
					}
					if pct >= 100.0 || m.downloads[i].Progress >= 100.0 {
						m.downloads[i].Progress = 100.0
						m.downloads[i].Speed = ""
						if m.downloads[i].StatusMsg == "" || m.downloads[i].StatusMsg == "Downloading..." || m.downloads[i].StatusMsg == "Resuming..." || m.downloads[i].StatusMsg == "Retrying..." {
							m.downloads[i].StatusMsg = "Processing..."
						}
						if moveFilesChan != nil {
							select {
							case moveFilesChan <- struct{}{}:
							default:
							}
						}
					} else {
						if m.downloads[i].StatusMsg == "" || m.downloads[i].StatusMsg == "Writing temporary cookies..." || m.downloads[i].StatusMsg == "Resuming..." || m.downloads[i].StatusMsg == "Retrying..." || m.downloads[i].StatusMsg == "Paused" || m.downloads[i].StatusMsg == "Pending" || m.downloads[i].StatusMsg == "Processing..." {
							m.downloads[i].StatusMsg = "Downloading..."
						}
						if speed != "" {
							m.downloads[i].Speed = speed
						}
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
			if saveNeeded {
				m.SaveHistory()
			}
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

		if !isProgress {
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
