package deps

import (
	"fmt"
	"vdm/internal/config"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func CheckAndResolveDependencies(app *application.App) {
	config.LoadConfig()

	depsList := []struct {
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

	for _, dep := range depsList {
		if !config.IsDependencyInstalled(dep.Name) {
			resolveDependency(app, dep.Name, dep.DownloadURL, dep.IsArchive)
		}
	}
}

func resolveDependency(app *application.App, name string, url string, isArchive bool) {
	ch := make(chan string)

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
		config.GlobalConfig.CustomPaths[name] = choice
		config.SaveConfig()
	}
}
