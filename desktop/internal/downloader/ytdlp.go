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

func BuildYouTubeCmd(ctx context.Context, downloadUrl, downloadDir, tempDir, itemPageUrl, formatId string) *exec.Cmd {
	threads := fmt.Sprintf("%d", config.GlobalConfig.ConcurrentFragments)
	outName := "%(title)s.%(ext)s"

	args := []string{
		downloadUrl,
		"-P", "home:" + downloadDir,
		"-P", "temp:" + tempDir,
		"-o", outName,
		"-N", threads,
		"--concurrent-fragments", threads,
		"--js-runtimes", "node",
		"--extractor-args", "youtube:player_client=android,web",
		"--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
		"--socket-timeout", "20",
		"--retries", "10",
		"--fragment-retries", "15",
		"--retry-sleep", "fragment:2",
		"--retry-sleep", "http:2",
	}

	if formatId != "" {
		args = append(args, "-f", formatId)
	}

	if itemPageUrl != "" {
		args = append(args, "--referer", itemPageUrl)
	}
	return exec.CommandContext(ctx, config.GetDependencyPath("yt-dlp"), args...)
}

func BuildHLSCmd(ctx context.Context, downloadUrl, downloadDir, tempDir, itemTitle string, updateState func(outPath string, genTitle string)) *exec.Cmd {
	threads := fmt.Sprintf("%d", config.GlobalConfig.ConcurrentFragments)
	titleToUse := itemTitle
	if titleToUse == "" || titleToUse == "Video" {
		filename := ExtractFilename(downloadUrl)
		if filename != "" && filename != "master.txt" && filename != "index.m3u8" && !strings.HasPrefix(filename, "master") {
			titleToUse = strings.TrimSuffix(filename, filepath.Ext(filename))
		}
	}

	var generatedTitle string
	if titleToUse != "" && titleToUse != "Video" {
		generatedTitle = titleToUse
	} else {
		generatedTitle = fmt.Sprintf("Video_%d", time.Now().Unix())
	}
	outName := SanitizeFilename(generatedTitle) + ".mp4"
	dest := filepath.Join(downloadDir, outName)

	if updateState != nil {
		updateState(dest, generatedTitle)
	}

	args := []string{
		downloadUrl,
		"-P", "home:" + downloadDir,
		"-P", "temp:" + tempDir,
		"-o", outName,
		"--downloader", "m3u8:native",
		"-N", threads,
		"--socket-timeout", "20",
		"--retries", "10",
		"--fragment-retries", "15",
		"--retry-sleep", "fragment:2",
		"--retry-sleep", "http:2",
	}
	if parsedUrl, err := url.Parse(downloadUrl); err == nil {
		origin := fmt.Sprintf("%s://%s", parsedUrl.Scheme, parsedUrl.Host)
		args = append(args, "--referer", origin+"/")
		args = append(args, "--add-header", "Origin: "+origin)
	}
	args = append(args, "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36")

	return exec.CommandContext(ctx, config.GetDependencyPath("yt-dlp"), args...)
}
