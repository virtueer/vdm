package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

)

func (a *App) StartDownloadProcess(id string, url string) {
	// Update status
	for i, item := range a.downloads {
		if item.ID == id {
			a.downloads[i].Status = "downloading"
			if a.wailsApp != nil {
				a.wailsApp.Event.Emit("download_updated", a.downloads[i])
			}
			break
		}
	}

	go func() {
		homeDir, _ := os.UserHomeDir()
		downloadPath := filepath.Join(homeDir, "Downloads", "%(title)s.%(ext)s")

		cmd := exec.Command("yt-dlp", url,
			"--downloader", "aria2c",
			"--downloader-args", "aria2c:-x 16 -s 16 -k 1M --file-allocation=none",
			"-o", downloadPath,
		)

		output, err := cmd.CombinedOutput()
		
		// Find index again as the array might have been modified
		itemIndex := -1
		for i, item := range a.downloads {
			if item.ID == id {
				itemIndex = i
				break
			}
		}

		if itemIndex != -1 {
			if err != nil {
				fmt.Printf("Download error for %s: %v\nOutput: %s\n", url, err, string(output))
				a.downloads[itemIndex].Status = "error"
			} else {
				fmt.Printf("Download completed for %s\n", url)
				a.downloads[itemIndex].Status = "completed"
			}

			if a.wailsApp != nil {
				a.wailsApp.Event.Emit("download_updated", a.downloads[itemIndex])
			}
		}
	}()
}
