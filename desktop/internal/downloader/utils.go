package downloader

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func IsYouTube(u string) bool {
	return strings.Contains(u, "youtube.com") || strings.Contains(u, "youtu.be")
}

func IsHLS(u string) bool {
	return strings.Contains(u, ".m3u8") || strings.Contains(u, "master.txt") || strings.Contains(u, "m3u8")
}

func SanitizeFilename(name string) string {
	if name == "" {
		return ""
	}

	name = strings.ReplaceAll(name, "\n", " ")
	name = strings.ReplaceAll(name, "\r", " ")
	name = strings.ReplaceAll(name, "\t", " ")

	invalidChars := []string{"<", ">", ":", "\"", "/", "\\", "|", "?", "*"}
	for _, char := range invalidChars {
		name = strings.ReplaceAll(name, char, "_")
	}

	for strings.Contains(name, "  ") {
		name = strings.ReplaceAll(name, "  ", " ")
	}

	name = strings.TrimSpace(name)
	if len(name) > 100 {
		name = name[:100]
	}
	return strings.TrimSpace(name)
}

func ExtractFilename(u string) string {
	parsed, err := url.Parse(u)
	if err == nil {
		path := parsed.Path
		parts := strings.Split(path, "/")
		last := parts[len(parts)-1]
		if last != "" {
			return last
		}
	}
	return fmt.Sprintf("download_%d.mp4", time.Now().Unix())
}

func GetFallbackReferer(downloadUrl string) string {
	u, err := url.Parse(downloadUrl)
	if err != nil {
		return ""
	}
	return fmt.Sprintf("%s://%s/", u.Scheme, u.Host)
}

func GetDownloadDir() string {
	home, _ := os.UserHomeDir()
	dir := filepath.Join(home, "Downloads")
	os.MkdirAll(dir, 0755)
	return dir
}
