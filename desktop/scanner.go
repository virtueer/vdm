package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func (m *Manager) scanExistingDownloadsLocked() {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return
	}

	dirsToScan := []string{
		filepath.Join(homeDir, "Downloads"),
	}

	if xdgDownload := os.Getenv("XDG_DOWNLOAD_DIR"); xdgDownload != "" && xdgDownload != dirsToScan[0] {
		dirsToScan = append(dirsToScan, xdgDownload)
	}

	videoExts := map[string]bool{
		".mp4": true, ".mkv": true, ".webm": true, ".mov": true, ".avi": true,
		".m4v": true, ".flv": true, ".ts": true, ".m4s": true, ".wmv": true,
		".3gp": true, ".mp3": true, ".m4a": true, ".aac": true, ".wav": true,
		".ogg": true,
	}

	existingByPath := make(map[string]int)
	existingByName := make(map[string]int)

	for i, d := range m.downloads {
		if d.Destination != "" {
			existingByPath[filepath.Clean(d.Destination)] = i
		}
		if d.URL != "" {
			existingByName[filepath.Base(d.URL)] = i
		}
		if d.Title != "" {
			existingByName[d.Title] = i
		}
	}

	var newDiscovered []DownloadItem

	for _, downloadDir := range dirsToScan {
		files, err := os.ReadDir(downloadDir)
		if err != nil {
			continue
		}

		for _, f := range files {
			if f.IsDir() {
				continue
			}
			ext := strings.ToLower(filepath.Ext(f.Name()))
			if !videoExts[ext] {
				continue
			}
			if strings.HasSuffix(f.Name(), ".part") || strings.HasSuffix(f.Name(), ".tmp") || strings.HasSuffix(f.Name(), ".aria2") {
				continue
			}

			fullPath := filepath.Clean(filepath.Join(downloadDir, f.Name()))

			// Skip items the user explicitly deleted from DB
			if m.db != nil && m.db.IsDeleted(fullPath, f.Name()) {
				continue
			}

			info, err := f.Info()
			if err != nil {
				continue
			}
			if info.Size() < 1024 {
				continue
			}

			if idx, exists := existingByPath[fullPath]; exists {
				if m.downloads[idx].TotalSize == "" || m.downloads[idx].TotalSize == "Unknown" || m.downloads[idx].TotalSize == "0 B" {
					m.downloads[idx].TotalSize = formatBytes(info.Size())
					m.downloads[idx].DownloadedSize = formatBytes(info.Size())
					m.saveItemLocked(m.downloads[idx])
				}
				continue
			}
			if idx, exists := existingByName[f.Name()]; exists {
				if m.downloads[idx].Destination == "" {
					m.downloads[idx].Destination = fullPath
				}
				if m.downloads[idx].TotalSize == "" || m.downloads[idx].TotalSize == "Unknown" || m.downloads[idx].TotalSize == "0 B" {
					m.downloads[idx].TotalSize = formatBytes(info.Size())
					m.downloads[idx].DownloadedSize = formatBytes(info.Size())
				}
				m.saveItemLocked(m.downloads[idx])
				existingByPath[fullPath] = idx
				continue
			}

			name := strings.TrimSuffix(f.Name(), ext)
			item := DownloadItem{
				ID:             fmt.Sprintf("%d", info.ModTime().UnixNano()),
				URL:            f.Name(),
				Title:          cleanVideoTitle(name),
				Destination:    fullPath,
				Status:         "completed",
				StatusMsg:      "Completed",
				Progress:       100.0,
				DownloadedSize: formatBytes(info.Size()),
				TotalSize:      formatBytes(info.Size()),
				CreatedAt:      info.ModTime().UnixMilli(),
			}
			newDiscovered = append(newDiscovered, item)
			m.saveItemLocked(item)
			existingByPath[fullPath] = len(m.downloads) + len(newDiscovered) - 1
		}
	}

	if len(newDiscovered) > 0 {
		m.downloads = append(m.downloads, newDiscovered...)
	}

	sort.Slice(m.downloads, func(i, j int) bool {
		return m.downloads[i].CreatedAt > m.downloads[j].CreatedAt
	})
}

func (m *Manager) ScanExistingDownloads() []DownloadItem {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.scanExistingDownloadsLocked()
	res := make([]DownloadItem, len(m.downloads))
	copy(res, m.downloads)
	return res
}
