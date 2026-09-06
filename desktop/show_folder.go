package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

func (m *Manager) ShowInFolder(id string) {
	var dest string
	homeDir, _ := os.UserHomeDir()
	downloadDir := filepath.Join(homeDir, "Downloads")

	m.mu.Lock()
	for _, item := range m.downloads {
		if item.ID == id {
			dest = item.Destination
			break
		}
	}
	m.mu.Unlock()

	if dest == "" {
		dest = downloadDir
	}

	dir := dest
	fileExists := false
	if fi, err := os.Stat(dest); err == nil {
		if !fi.IsDir() {
			dir = filepath.Dir(dest)
			fileExists = true
		} else {
			dir = dest
		}
	}

	go func() {
		switch runtime.GOOS {
		case "windows":
			if fileExists {
				_ = exec.Command("explorer", "/select,"+dest).Run()
			} else {
				_ = exec.Command("explorer", dir).Run()
			}
		case "darwin":
			if fileExists {
				_ = exec.Command("open", "-R", dest).Run()
			} else {
				_ = exec.Command("open", dir).Run()
			}
		default:
			// Linux:
			if fileExists {
				fileURI := "file://" + dest

				// 1. Try standard FreeDesktop / DBus FileManager1 interface (Supported by Nautilus, Dolphin, Nemo, Thunar, etc.)
				cmdDBus := exec.Command("dbus-send", "--session", "--dest=org.freedesktop.FileManager1", "--type=method_call",
					"/org/freedesktop/FileManager1", "org.freedesktop.FileManager1.ShowItems",
					"array:string:"+fileURI, "string:")
				if err := cmdDBus.Run(); err == nil {
					return
				}

				// 2. Try gdbus
				cmdGDBus := exec.Command("gdbus", "call", "--session", "--dest", "org.freedesktop.FileManager1",
					"--object-path", "/org/freedesktop/FileManager1",
					"--method", "org.freedesktop.FileManager1.ShowItems",
					fmt.Sprintf("['%s']", fileURI), "")
				if err := cmdGDBus.Run(); err == nil {
					return
				}

				// 3. Try specific file managers with select flags
				if _, err := exec.LookPath("nautilus"); err == nil {
					if err := exec.Command("nautilus", "--select", dest).Start(); err == nil {
						return
					}
				}
				if _, err := exec.LookPath("dolphin"); err == nil {
					if err := exec.Command("dolphin", "--select", dest).Start(); err == nil {
						return
					}
				}
				if _, err := exec.LookPath("nemo"); err == nil {
					if err := exec.Command("nemo", dest).Start(); err == nil {
						return
					}
				}
				if _, err := exec.LookPath("pcmanfm"); err == nil {
					if err := exec.Command("pcmanfm", "--select", dest).Start(); err == nil {
						return
					}
				}
				if _, err := exec.LookPath("pcmanfm-qt"); err == nil {
					if err := exec.Command("pcmanfm-qt", "--select", dest).Start(); err == nil {
						return
					}
				}
				if _, err := exec.LookPath("thunar"); err == nil {
					if err := exec.Command("thunar", dest).Start(); err == nil {
						return
					}
				}
			}

			// Fallback: open parent folder
			cmd := exec.Command("xdg-open", dir)
			if err := cmd.Run(); err != nil {
				for _, fm := range []string{"thunar", "nautilus", "dolphin", "nemo", "pcmanfm"} {
					if _, errLook := exec.LookPath(fm); errLook == nil {
						_ = exec.Command(fm, dir).Start()
						break
					}
				}
			}
		}
	}()
}
