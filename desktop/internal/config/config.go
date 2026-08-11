package config

import (
	"encoding/json"
	"os"
	"path/filepath"
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

func GetConfigPath() string {
	home, _ := os.UserHomeDir()
	dir := filepath.Join(home, ".vdm")
	os.MkdirAll(dir, 0755)
	return filepath.Join(dir, "config.json")
}

func LoadConfig() {
	b, err := os.ReadFile(GetConfigPath())
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

func SaveConfig() {
	b, _ := json.Marshal(GlobalConfig)
	os.WriteFile(GetConfigPath(), b, 0644)
}
