package downloader

import (
	"context"
	"fmt"
	"net/url"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
	"vdm/internal/config"
)

func BuildAria2cCmd(ctx context.Context, downloadUrl, homeDir, itemTitle string, updateState func(dest string, title string)) *exec.Cmd {
	filename := ExtractFilename(downloadUrl)

	titleToUse := itemTitle
	if titleToUse == "" || titleToUse == "Video" {
		if filename != "" {
			titleToUse = strings.TrimSuffix(filename, filepath.Ext(filename))
		}
	}

	if titleToUse == "" || titleToUse == "Video" {
		titleToUse = fmt.Sprintf("Video_%d", time.Now().Unix())
	}

	ext := filepath.Ext(filename)
	if ext == "" {
		ext = ".mp4"
	}
	filename = SanitizeFilename(titleToUse) + ext
	downloadPath := filepath.Join(homeDir, "Downloads")
	dest := filepath.Join(downloadPath, filename)

	if updateState != nil {
		updateState(dest, titleToUse)
	}

	threadsStr := fmt.Sprintf("%d", config.GlobalConfig.ConcurrentFragments)

	args := []string{
		"-c",
		"--auto-file-renaming=false",
		"--allow-overwrite=false",
		"-x", threadsStr,
		"-s", threadsStr,
		"-k", "1M",
		"--file-allocation=none",
		"--max-tries=5",
		"--retry-wait=3",
		"--summary-interval=1",
		"-d", downloadPath,
		"-o", filename,
	}

	if parsedUrl, err := url.Parse(downloadUrl); err == nil {
		origin := fmt.Sprintf("%s://%s", parsedUrl.Scheme, parsedUrl.Host)
		args = append(args, fmt.Sprintf("--referer=%s/", origin))
		args = append(args, "--header", "Origin: "+origin)
	}
	args = append(args, "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36")
	args = append(args, downloadUrl)

	return exec.CommandContext(ctx, config.GetDependencyPath("aria2c"), args...)
}
