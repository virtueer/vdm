package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

type App struct{}

func main() {
	app := application.New(application.Options{
		Name:        "video-download-manager",
		Description: "Video Download Manager",
		Services: []application.Service{
			application.NewService(&App{}),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:  "Video Download Manager",
		Width:  1000,
		Height: 618,
		URL:    "/",
	})

	err := app.Run()
	if err != nil {
		log.Fatal(err)
	}
}
