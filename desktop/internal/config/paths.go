package config

import (
	"os"
	"os/exec"
	"path/filepath"
)

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
