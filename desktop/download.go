package main

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync/atomic"
	"time"
)

func isYouTube(u string) bool {
	return strings.Contains(u, "youtube.com") || strings.Contains(u, "youtu.be")
}

func isHLS(u string) bool {
	return strings.Contains(u, ".m3u8") || strings.Contains(u, "master.txt") || strings.Contains(u, "m3u8")
}

func extractFilename(u string) string {
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

func getFallbackReferer(downloadUrl string) string {
	u, err := url.Parse(downloadUrl)
	if err != nil {
		return ""
	}
	return fmt.Sprintf("%s://%s/", u.Scheme, u.Host)
}

// Fixed regex: ~?\s* (multiple spaces after tilde) and allow both KiB/s and MiB/s
var ytdlpRegex = regexp.MustCompile(`\[download\]\s+(?P<percent>[\d\.]+)%\s+of\s+~?\s*(?P<size>[\d\.]+\s*\w+)\s+at\s+(?P<speed>[\d\.]+\s*\w+/s)`)
var aria2cRegex = regexp.MustCompile(`\[#[^\]]+\]\s+(\S+)/(\S+)\s+\((\d+)%\).*DL:(\S+)`)

// isProgressLine returns true if the line contains download progress info (regex match)
func isProgressLine(line string) bool {
	return ytdlpRegex.MatchString(line) || aria2cRegex.MatchString(line)
}

func (a *App) parseProgressLine(id string, line string, lastEmitMs *int64) bool {
	isProgress := isProgressLine(line)
	if !isProgress {
		return false
	}

	// Throttle event emission to at most 2 per second to avoid flooding UI
	now := time.Now().UnixMilli()
	last := atomic.LoadInt64(lastEmitMs)
	if now-last < 500 {
		return true // it IS a progress line, but we skip emitting
	}
	atomic.StoreInt64(lastEmitMs, now)

	if match := ytdlpRegex.FindStringSubmatch(line); match != nil {
		if a.wailsApp != nil {
			a.wailsApp.Event.Emit("download_progress", map[string]interface{}{
				"id":         id,
				"percentage": strings.TrimSpace(match[1]),
				"total":      strings.TrimSpace(match[2]),
				"speed":      strings.TrimSpace(match[3]),
			})
		}
	} else if match := aria2cRegex.FindStringSubmatch(line); match != nil {
		if a.wailsApp != nil {
			a.wailsApp.Event.Emit("download_progress", map[string]interface{}{
				"id":         id,
				"downloaded": strings.TrimSpace(match[1]),
				"total":      strings.TrimSpace(match[2]),
				"percentage": strings.TrimSpace(match[3]),
				"speed":      strings.TrimSpace(match[4]),
			})
		}
	}
	return true
}

func (a *App) StartDownloadProcess(id string, downloadUrl string) {
	// Update status
	for i, item := range a.downloads {
		if item.ID == id {
			a.downloads[i].Status = "downloading"
			if a.wailsApp != nil {
				a.wailsApp.Event.Emit("download_updated", a.downloads[i])
			}
			break
		}
	}

	go func() {
		homeDir, _ := os.UserHomeDir()

		var itemPageUrl string
		for _, item := range a.downloads {
			if item.ID == id {
				itemPageUrl = item.PageURL
				break
			}
		}

		if itemPageUrl == "" {
			itemPageUrl = getFallbackReferer(downloadUrl)
		}

		ctx, cancel := context.WithCancel(context.Background())
		a.mu.Lock()
		a.cancelFuncs[id] = cancel
		a.mu.Unlock()

		defer func() {
			a.mu.Lock()
			delete(a.cancelFuncs, id)
			a.mu.Unlock()
			cancel()
		}()

		var cmd *exec.Cmd

		if isYouTube(downloadUrl) {
			downloadPath := filepath.Join(homeDir, "Downloads", "%(title)s.%(ext)s")
			aria2cPath := GetDependencyPath("aria2c")
			threads := fmt.Sprintf("%d", GlobalConfig.ConcurrentFragments)
			args := []string{downloadUrl, "--downloader", aria2cPath, "--downloader-args", fmt.Sprintf("aria2c:-x %s -s %s -k 1M --file-allocation=none", threads, threads), "-o", downloadPath}
			if itemPageUrl != "" {
				args = append(args, "--referer", itemPageUrl)
			}
			cmd = exec.CommandContext(ctx, GetDependencyPath("yt-dlp"), args...)
		} else if isHLS(downloadUrl) {
			// For HLS, let yt-dlp determine the title via %(title)s
			downloadPath := filepath.Join(homeDir, "Downloads", "%(title)s.%(ext)s")

			// Use half of configured threads but max 2 to avoid 429 rate-limiting.
			// The server bans IPs that make too many simultaneous requests.
			// yt-dlp downloads video + audio tracks in parallel, so effective connections = N*2.
			hlsThreads := GlobalConfig.ConcurrentFragments / 2
			if hlsThreads < 1 {
				hlsThreads = 1
			}
			if hlsThreads > 2 {
				hlsThreads = 2
			}
			threads := fmt.Sprintf("%d", hlsThreads)
			args := []string{
				downloadUrl,
				"--downloader", "m3u8:native",
				"-N", threads,
				"--sleep-requests", "1",    // 1s sleep between fragment requests to avoid 429
				"--socket-timeout", "20",
				"--retries", "10",
				"--fragment-retries", "15", // more retries for flaky CDNs
				"-o", downloadPath,
			}
			if itemPageUrl != "" {
				args = append(args, "--referer", itemPageUrl)
			}
			cmd = exec.CommandContext(ctx, GetDependencyPath("yt-dlp"), args...)
		} else {
			// Classic multi-connection downloader via aria2c
			filename := extractFilename(downloadUrl)
			downloadPath := filepath.Join(homeDir, "Downloads") // aria2c takes dir and file separately

			threads := fmt.Sprintf("%d", GlobalConfig.ConcurrentFragments)
			args := []string{
				"-x", threads,
				"-s", threads,
				"-k", "1M",
				"--file-allocation=none",
				"-d", downloadPath,
				"-o", filename,
			}

			if itemPageUrl != "" {
				args = append(args, fmt.Sprintf("--referer=%s", itemPageUrl))
			}

			args = append(args, downloadUrl)
			cmd = exec.CommandContext(ctx, GetDependencyPath("aria2c"), args...)
		}

		a.Logf("Executing command: %s %s\n", cmd.Path, strings.Join(cmd.Args, " "))

		stdout, _ := cmd.StdoutPipe()
		stderr, _ := cmd.StderrPipe()

		cmd.Start()

		splitCRLF := func(data []byte, atEOF bool) (advance int, token []byte, err error) {
			if atEOF && len(data) == 0 {
				return 0, nil, nil
			}
			if i := bytes.IndexAny(data, "\r\n"); i >= 0 {
				return i + 1, data[0:i], nil
			}
			if atEOF {
				return len(data), data, nil
			}
			return 0, nil, nil
		}

		var lastEmitMs int64

		go func() {
			scanner := bufio.NewScanner(stdout)
			scanner.Split(splitCRLF)
			for scanner.Scan() {
				text := strings.TrimSpace(scanner.Text())
				if text == "" {
					continue
				}
				isProgress := a.parseProgressLine(id, text, &lastEmitMs)
				// Only log non-progress lines to avoid flooding
				if !isProgress {
					a.Logf("%s\n", text)
				}
			}
		}()

		go func() {
			scanner := bufio.NewScanner(stderr)
			scanner.Split(splitCRLF)
			for scanner.Scan() {
				text := strings.TrimSpace(scanner.Text())
				if text == "" {
					continue
				}
				// Try to parse as progress first (some lines go to stderr)
				isProgress := a.parseProgressLine(id, text, &lastEmitMs)
				// Skip repetitive 429 retry lines and progress lines from the terminal log
				if !isProgress && !strings.Contains(text, "Retrying fragment") {
					a.Logf("%s\n", text)
				}
			}
		}()

		err := cmd.Wait()

		// Find index again as the array might have been modified
		itemIndex := -1
		for i, item := range a.downloads {
			if item.ID == id {
				itemIndex = i
				break
			}
		}

		if itemIndex != -1 {
			// If status is already cancelled, don't overwrite it
			if a.downloads[itemIndex].Status == "cancelled" {
				return
			}
			
			if err != nil {
				a.Logf("Download error for %s: %v\n", downloadUrl, err)
				a.downloads[itemIndex].Status = "error"
			} else {
				a.Logf("Download completed for %s\n", downloadUrl)
				a.downloads[itemIndex].Status = "completed"
			}

			if a.wailsApp != nil {
				a.wailsApp.Event.Emit("download_updated", a.downloads[itemIndex])
			}
		}
	}()
}
