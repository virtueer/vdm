package downloader

import (
	"fmt"
	"os"
	"path/filepath"
	"time"
)

func (m *Manager) RemoveDownload(id string, deleteFile bool) {
	m.mu.Lock()
	if cancel, exists := m.cancelFuncs[id]; exists {
		cancel()
		delete(m.cancelFuncs, id)
	}

	indexToRemove := -1
	var fileToDelete string
	for i, item := range m.downloads {
		if item.ID == id {
			indexToRemove = i
			fileToDelete = item.Destination
			break
		}
	}

	if indexToRemove != -1 {
		m.downloads = append(m.downloads[:indexToRemove], m.downloads[indexToRemove+1:]...)
	}
	m.mu.Unlock()

	if m.store != nil {
		m.store.DeleteDownload(id)
	}

	if m.wailsApp != nil {
		m.wailsApp.Event.Emit("download_removed", id)
	}
	m.SaveHistory()

	if deleteFile && fileToDelete != "" {
		go func() {
			m.Logf("Deleting file for removed download: %s\n", fileToDelete)
			os.Remove(fileToDelete)
			os.Remove(fileToDelete + ".part")
			os.Remove(fileToDelete + ".ytdl")
			os.Remove(fileToDelete + ".aria2")

			downloadDir := GetDownloadDir()
			baseName := filepath.Base(fileToDelete)
			if baseName != "" && baseName != "." {
				finalPath := filepath.Join(downloadDir, baseName)
				os.Remove(finalPath)
				os.Remove(finalPath + ".part")
				os.Remove(finalPath + ".ytdl")
				os.Remove(finalPath + ".aria2")
			}
		}()
	}
}

func (m *Manager) CancelDownload(id string) {
	m.mu.Lock()
	if cancel, exists := m.cancelFuncs[id]; exists {
		cancel()
		delete(m.cancelFuncs, id)
	}

	var fileToDelete string
	var itemFound bool
	var title string
	for i, item := range m.downloads {
		if item.ID == id {
			itemFound = true
			title = item.Title
			if title == "" {
				title = item.URL
			}
			if item.Status != "completed" {
				m.downloads[i].Status = "cancelled"
				m.downloads[i].StatusMsg = "Cancelled"
				fileToDelete = item.Destination
				if m.wailsApp != nil {
					m.wailsApp.Event.Emit("download_updated", m.downloads[i])
				}
			}
			break
		}
	}
	m.mu.Unlock()
	m.SaveHistory()

	ts := time.Now().Format("15:04:05")
	logMsg := fmt.Sprintf("[%s] Download cancelled", ts)
	m.Logf("Cancelling download %s (%s)\n", id, title)
	m.SaveDownloadLog(id, logMsg)
	if m.wailsApp != nil {
		m.wailsApp.Event.Emit("download_log", map[string]string{
			"id":      id,
			"message": logMsg,
		})
	}

	if itemFound && fileToDelete != "" {
		go func() {
			m.Logf("Deleting partial file for cancelled download: %s\n", fileToDelete)
			os.Remove(fileToDelete)
			os.Remove(fileToDelete + ".part")
			os.Remove(fileToDelete + ".ytdl")
			os.Remove(fileToDelete + ".aria2")
		}()
	}
}
