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
		Name:        "video-download-manager",
		Description: "Video Download Manager",
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

	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:  "Video Download Manager",
		Width:  1000,
		Height: 650,
		URL:    "/",
	})

	myApp.SetWindow(window)

	err := app.Run()
	if err != nil {
		log.Fatal(err)
	}
}
