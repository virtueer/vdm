package downloader

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

func (m *Manager) StartDownloadProcess(id string, downloadUrl string) {
	nowMs := time.Now().UnixMilli()
	ctx, cancel := context.WithCancel(context.Background())

	m.mu.Lock()
	if oldCancel, exists := m.cancelFuncs[id]; exists {
		oldCancel()
	}
	m.cancelFuncs[id] = cancel

	for i, item := range m.downloads {
		if item.ID == id {
			m.downloads[i].Status = "downloading"
			m.downloads[i].StatusMsg = "Downloading..."
			m.downloads[i].StartedAt = nowMs
			if m.wailsApp != nil {
				m.wailsApp.Event.Emit("download_updated", m.downloads[i])
			}
			break
		}
	}
	m.mu.Unlock()
	m.SaveHistory()

	go func() {
		defer func() {
			m.mu.Lock()
			delete(m.cancelFuncs, id)
			m.mu.Unlock()
			cancel()
		}()

		select {
		case <-ctx.Done():
			m.Logf("Download %s canceled before starting process\n", id)
			return
		default:
		}

		homeDir, _ := os.UserHomeDir()
		downloadDir := filepath.Join(homeDir, "Downloads")
		tempDir := filepath.Join(homeDir, ".vdm", "temp")
		os.MkdirAll(tempDir, 0755)

		var itemPageUrl string
		var itemTitle string
		var formatId string

		m.mu.Lock()
		for _, item := range m.downloads {
			if item.ID == id {
				itemPageUrl = item.PageURL
				itemTitle = item.Title
				formatId = item.FormatID
				break
			}
		}
		m.mu.Unlock()

		if itemPageUrl == "" {
			itemPageUrl = GetFallbackReferer(downloadUrl)
		}

		select {
		case <-ctx.Done():
			m.Logf("Download %s canceled before command build\n", id)
			return
		default:
		}

		var cmd *exec.Cmd
		if IsYouTube(downloadUrl) {
			cmd = BuildYouTubeCmd(ctx, downloadUrl, downloadDir, tempDir, itemPageUrl, formatId)
		} else if IsHLS(downloadUrl) {
			cmd = BuildHLSCmd(ctx, downloadUrl, downloadDir, tempDir, itemTitle, func(outPath, genTitle string) {
				m.mu.Lock()
				for i, d := range m.downloads {
					if d.ID == id {
						m.downloads[i].Destination = outPath
						if itemTitle == "" || itemTitle == "Video" {
							m.downloads[i].Title = genTitle
						}
						if m.wailsApp != nil {
							m.wailsApp.Event.Emit("download_updated", m.downloads[i])
						}
						break
					}
				}
				m.mu.Unlock()
			})
		} else {
			cmd = BuildAria2cCmd(ctx, downloadUrl, homeDir, itemTitle, func(dest, title string) {
				m.mu.Lock()
				for i, item := range m.downloads {
					if item.ID == id {
						m.downloads[i].Destination = dest
						if itemTitle == "" || itemTitle == "Video" {
							m.downloads[i].Title = title
						}
						if m.wailsApp != nil {
							m.wailsApp.Event.Emit("download_updated", m.downloads[i])
						}
						break
					}
				}
				m.mu.Unlock()
			})
		}

		cmd.Env = append(os.Environ(), "PYTHONUNBUFFERED=1")
		cmd.WaitDelay = 1 * time.Second

		select {
		case <-ctx.Done():
			m.Logf("Download %s canceled before process start\n", id)
			return
		default:
		}

		cmdStr := fmt.Sprintf("Executing command: %s %s", cmd.Path, strings.Join(cmd.Args, " "))
		ts := time.Now().Format("15:04:05")
		logMsg := fmt.Sprintf("[%s] %s", ts, cmdStr)
		m.Logf("%s\n", cmdStr)
		m.SaveDownloadLog(id, logMsg)
		if m.wailsApp != nil {
			m.wailsApp.Event.Emit("download_log", map[string]string{
				"id":      id,
				"message": logMsg,
			})
		}

		stdout, err := cmd.StdoutPipe()
		if err != nil {
			m.Logf("Failed to create stdout pipe: %v\n", err)
			return
		}
		stderr, err := cmd.StderrPipe()
		if err != nil {
			m.Logf("Failed to create stderr pipe: %v\n", err)
			return
		}

		PrepareCmd(cmd)
		if err := cmd.Start(); err != nil {
			m.Logf("Failed to start command: %v\n", err)
			m.mu.Lock()
			for i, item := range m.downloads {
				if item.ID == id {
					m.downloads[i].Status = "error"
					m.downloads[i].StatusMsg = "Failed to start command"
					if m.wailsApp != nil {
						m.wailsApp.Event.Emit("download_updated", m.downloads[i])
					}
					break
				}
			}
			m.mu.Unlock()
			return
		}
		m.Logf("Command started successfully\n")

		m.handleStreamScanning(id, downloadUrl, stdout, stderr, cmd.Wait)
	}()
}
