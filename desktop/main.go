package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	myApp := NewApp()

	app := application.New(application.Options{
		Name:        "vdm-desktop",
		Description: "VDM Video Downloader",
		Services: []application.Service{
			application.NewService(myApp),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	myApp.SetWailsApp(app)
	myApp.StartServer()

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:  "VDM Video Downloader",
		Width:  1000,
		Height: 618,
		URL:    "/",
	})

	err := app.Run()
	if err != nil {
		log.Fatal(err)
	}
}
