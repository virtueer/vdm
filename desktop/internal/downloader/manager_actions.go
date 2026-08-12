package downloader

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
	"vdm/internal/models"
)

func (m *Manager) SetDownloadFormat(id string, formatId string) {
	m.mu.Lock()
	for i, item := range m.downloads {
		if item.ID == id {
			m.downloads[i].FormatID = formatId
			if m.wailsApp != nil {
				m.wailsApp.Event.Emit("download_updated", m.downloads[i])
			}
			break
		}
	}
	m.mu.Unlock()
	m.SaveHistory()
}

func (m *Manager) AddDownload(urlStr, typ, size, pageUrl, title, formatId string) {
	m.Logf("New download request: %s (from %s, title: %s, format: %s)\n", urlStr, pageUrl, title, formatId)

	if IsYouTube(urlStr) && formatId == "" {
		if m.wailsApp != nil {
			m.wailsApp.Event.Emit("new_youtube_download", map[string]string{
				"url":   urlStr,
				"title": title,
			})
		}
		if m.mainWindow != nil {
			m.mainWindow.Show()
			m.mainWindow.Focus()
		}
		return
	}

	nowMs := time.Now().UnixMilli()
	item := models.DownloadItem{
		ID:        fmt.Sprintf("%d", time.Now().UnixNano()),
		URL:       urlStr,
		Type:      typ,
		Size:      size,
		Status:    "pending",
		PageURL:   pageUrl,
		Title:     title,
		FormatID:  formatId,
		CreatedAt: nowMs,
	}

	m.mu.Lock()
	m.downloads = append(m.downloads, item)
	m.mu.Unlock()
	m.SaveHistory()

	if m.wailsApp != nil {
		m.wailsApp.Event.Emit("new_download", item)
	}

	if m.mainWindow != nil {
		m.mainWindow.Show()
		m.mainWindow.Focus()
	}

	m.StartDownloadProcess(item.ID, urlStr)
}

func (m *Manager) ShowInFolder(id string) {
	var dest string
	downloadDir := GetDownloadDir()

	m.mu.Lock()
	for _, item := range m.downloads {
		if item.ID == id {
			dest = item.Destination
			break
		}
	}
	m.mu.Unlock()

	if dest == "" || strings.Contains(dest, ".vdm/temp") {
		dest = downloadDir
	}

	dir := dest
	if fi, err := os.Stat(dest); err == nil && !fi.IsDir() {
		dir = filepath.Dir(dest)
	} else if _, err := os.Stat(dest); err != nil {
		dir = filepath.Dir(dest)
		if _, dirErr := os.Stat(dir); dirErr != nil {
			dir = downloadDir
		}
	}

	m.Logf("Opening folder in file manager: %s (dest: %s)\n", dir, dest)

	go func() {
		switch runtime.GOOS {
		case "windows":
			if _, err := os.Stat(dest); err == nil {
				exec.Command("explorer", "/select,"+dest).Run()
			} else {
				exec.Command("explorer", dir).Run()
			}
		case "darwin":
			if _, err := os.Stat(dest); err == nil {
				exec.Command("open", "-R", dest).Run()
			} else {
				exec.Command("open", dir).Run()
			}
		default:
			cmd := exec.Command("xdg-open", dir)
			out, err := cmd.CombinedOutput()
			if err != nil {
				m.Logf("xdg-open failed for %s: %v (output: %s)\n", dir, err, string(out))
				for _, fm := range []string{"nautilus", "dolphin", "thunar", "nemo", "pcmanfm"} {
					if _, errLook := exec.LookPath(fm); errLook == nil {
						m.Logf("Fallback opening with %s %s\n", fm, dir)
						exec.Command(fm, dir).Start()
						break
					}
				}
			}
		}
	}()
}
