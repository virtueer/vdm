package main

import (
	"archive/tar"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type AppConfig struct {
	CustomPaths         map[string]string `json:"customPaths"`
	ConcurrentFragments int               `json:"concurrentFragments"`
	EnableProbe         bool              `json:"enableProbe"`
	ProbeSizeMB         int               `json:"probeSizeMB"`
}

var GlobalConfig = AppConfig{
	CustomPaths:         make(map[string]string),
	ConcurrentFragments: 16,
	EnableProbe:         true,
	ProbeSizeMB:         5,
}

func getConfigPath() string {
	home, _ := os.UserHomeDir()
	dir := filepath.Join(home, ".vdm")
	os.MkdirAll(dir, 0755)
	return filepath.Join(dir, "config.json")
}

func loadConfig() {
	b, err := os.ReadFile(getConfigPath())
	if err == nil {
		json.Unmarshal(b, &GlobalConfig)
	}
	if GlobalConfig.CustomPaths == nil {
		GlobalConfig.CustomPaths = make(map[string]string)
	}
	if GlobalConfig.ConcurrentFragments <= 0 {
		GlobalConfig.ConcurrentFragments = 16
	}
	if GlobalConfig.ProbeSizeMB <= 0 {
		GlobalConfig.ProbeSizeMB = 5
	}
}

func saveConfig() {
	b, _ := json.Marshal(GlobalConfig)
	os.WriteFile(getConfigPath(), b, 0644)
}

func GetDependencyPath(name string) string {
	// 1. Check if user manually selected a path
	if p, ok := GlobalConfig.CustomPaths[name]; ok && p != "" {
		return p
	}

	// 2. Check local vdm-bin folder
	home, _ := os.UserHomeDir()
	localBin := filepath.Join(home, ".vdm", "bin", name)
	if _, err := os.Stat(localBin); err == nil {
		return localBin
	}

	// 3. Check system PATH
	if p, err := exec.LookPath(name); err == nil {
		return p
	}

	return name
}

func IsDependencyInstalled(name string) bool {
	p := GetDependencyPath(name)
	if p != name {
		return true
	}
	_, err := exec.LookPath(name)
	return err == nil
}

func CheckAndResolveDependencies(app *application.App) {
	loadConfig()

	deps := []struct {
		Name        string
		DownloadURL string
		IsArchive   bool
	}{
		{
			Name:        "yt-dlp",
			DownloadURL: "https://github.com/yt-dlp/yt-dlp/releases/download/2025.01.26/yt-dlp",
			IsArchive:   false,
		},
		{
			Name:        "aria2c",
			DownloadURL: "https://github.com/P3TERX/Aria2-Pro-Core/releases/download/1.36.0_2021.08.22/aria2-1.36.0-static-linux-amd64.tar.gz",
			IsArchive:   true,
		},
	}

	for _, dep := range deps {
		if !IsDependencyInstalled(dep.Name) {
			resolveDependency(app, dep.Name, dep.DownloadURL, dep.IsArchive)
		}
	}
}

func resolveDependency(app *application.App, name string, url string, isArchive bool) {
	ch := make(chan string)

	// Since we are running in a goroutine, we need to show the dialog on the main thread?
	// Wails v3 dialogs can be called from any goroutine, they manage threading internally.
	
	dialog := app.Dialog.Question().
		SetTitle(fmt.Sprintf("Dependency Missing: %s", name)).
		SetMessage(fmt.Sprintf("The required tool '%s' is not installed or not found in your system.\n\nDo you already have it installed somewhere else, or should I download it automatically?", name))
	
	dialog.AddButton("Yes, I have it (Select Path)").OnClick(func() {
		path, err := app.Dialog.OpenFile().
			SetTitle(fmt.Sprintf("Select %s executable", name)).
			PromptForSingleSelection()
		if err != nil || path == "" {
			ch <- ""
		} else {
			ch <- path
		}
	})

	dialog.AddButton("No, Download it automatically").OnClick(func() {
		ch <- "download"
	})

	dialog.Show()

	choice := <-ch
	if choice == "" {
		// User closed or cancelled
		return
	}

	if choice == "download" {
		err := downloadAndInstallDependency(name, url, isArchive)
		if err != nil {
			app.Dialog.Error().SetTitle("Download Failed").SetMessage(fmt.Sprintf("Failed to download %s: %v", name, err)).Show()
		} else {
			app.Dialog.Info().SetTitle("Success").SetMessage(fmt.Sprintf("Successfully installed %s", name)).Show()
		}
	} else {
		// User selected a custom path
		GlobalConfig.CustomPaths[name] = choice
		saveConfig()
	}
}

func downloadAndInstallDependency(name string, downloadUrl string, isArchive bool) error {
	home, _ := os.UserHomeDir()
	binDir := filepath.Join(home, ".vdm", "bin")
	os.MkdirAll(binDir, 0755)

	targetPath := filepath.Join(binDir, name)

	resp, err := http.Get(downloadUrl)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("bad status: %s", resp.Status)
	}

	if !isArchive {
		// Direct binary download
		out, err := os.OpenFile(targetPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
		if err != nil {
			return err
		}
		defer out.Close()

		_, err = io.Copy(out, resp.Body)
		return err
	}

	// Archive extraction (tar.gz)
	gzr, err := gzip.NewReader(resp.Body)
	if err != nil {
		return err
	}
	defer gzr.Close()

	tr := tar.NewReader(gzr)
	for {
		header, err := tr.Next()
		if err == io.EOF {
			break // End of archive
		}
		if err != nil {
			return err
		}

		if header.Typeflag == tar.TypeReg && strings.Contains(header.Name, name) {
			out, err := os.OpenFile(targetPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
			if err != nil {
				return err
			}
			_, err = io.Copy(out, tr)
			out.Close()
			if err != nil {
				return err
			}
			break
		}
	}

	return nil
}
