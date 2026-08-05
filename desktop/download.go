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

func sanitizeFilename(name string) string {
	if name == "" {
		return ""
	}
	
	// Replace newlines and tabs with spaces
	name = strings.ReplaceAll(name, "\n", " ")
	name = strings.ReplaceAll(name, "\r", " ")
	name = strings.ReplaceAll(name, "\t", " ")

	invalidChars := []string{"<", ">", ":", "\"", "/", "\\", "|", "?", "*"}
	for _, char := range invalidChars {
		name = strings.ReplaceAll(name, char, "_")
	}
	
	// Collapse multiple spaces into one
	for strings.Contains(name, "  ") {
		name = strings.ReplaceAll(name, "  ", " ")
	}
	
	name = strings.TrimSpace(name)

	// Limit length
	if len(name) > 100 {
		name = name[:100]
	}
	return strings.TrimSpace(name)
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
var ytDlpDestRegex = regexp.MustCompile(`\[download\] Destination: (.*)`)
var ytDlpAlreadyDestRegex = regexp.MustCompile(`\[download\] (.*) has already been downloaded`)

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
		downloadDir := filepath.Join(homeDir, "Downloads")
		tempDir := filepath.Join(homeDir, ".vdm", "temp")
		os.MkdirAll(tempDir, 0755)

		var itemPageUrl string
		var itemTitle string
		for _, item := range a.downloads {
			if item.ID == id {
				itemPageUrl = item.PageURL
				itemTitle = item.Title
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
			aria2cPath := GetDependencyPath("aria2c")
			threads := fmt.Sprintf("%d", GlobalConfig.ConcurrentFragments)
			
			outName := "%(title)s.%(ext)s"
			if itemTitle != "" {
				// Even for YouTube, if we have a title, we could hint it, but yt-dlp 
				// usually extracts a much better title. Still, let's keep %(title)s.
				// However, if the user explicitly wants the captured title:
				// outName = sanitizeFilename(itemTitle) + ".%(ext)s"
				// Let's stick to yt-dlp's title for YouTube because it's reliable.
			}

			args := []string{
				downloadUrl, 
				"-P", "home:" + downloadDir,
				"-P", "temp:" + tempDir,
				"-o", outName,
				"--downloader", aria2cPath, 
				"--downloader-args", fmt.Sprintf("aria2c:-x %s -s %s -k 1M --file-allocation=none", threads, threads),
				"--retry-sleep", "fragment:2",
				"--retry-sleep", "http:2",
			}
			if itemPageUrl != "" {
				args = append(args, "--referer", itemPageUrl)
			}
			cmd = exec.CommandContext(ctx, GetDependencyPath("yt-dlp"), args...)
		} else if isHLS(downloadUrl) {
			threads := fmt.Sprintf("%d", GlobalConfig.ConcurrentFragments)
			var outName string
			
			// 1. Chrome extension title (itemTitle)
			// 2. If empty or generic, use stream filename
			titleToUse := itemTitle
			if titleToUse == "" || titleToUse == "Video" {
				filename := extractFilename(downloadUrl)
				if filename != "" && filename != "master.txt" && filename != "index.m3u8" && !strings.HasPrefix(filename, "master") {
					titleToUse = strings.TrimSuffix(filename, filepath.Ext(filename))
				}
			}
			
			var generatedTitle string
			if titleToUse != "" && titleToUse != "Video" {
				generatedTitle = titleToUse
			} else {
				// 3. Fallback to random
				generatedTitle = fmt.Sprintf("Video_%d", time.Now().Unix())
			}
			outName = sanitizeFilename(generatedTitle) + ".mp4"
			
			// Update the title and destination in state
			a.mu.Lock()
			for i, d := range a.downloads {
				if d.ID == id {
					a.downloads[i].Destination = filepath.Join(downloadDir, outName)
					if itemTitle == "" || itemTitle == "Video" {
						a.downloads[i].Title = generatedTitle
					}
					if a.wailsApp != nil {
						a.wailsApp.Event.Emit("download_updated", a.downloads[i])
					}
					break
				}
			}
			a.mu.Unlock()

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
				"--retry-sleep", "fragment:2", // linear short wait instead of exponential backoff
				"--retry-sleep", "http:2",
			}
			// Many CDNs expect the Referer/Origin to be their own player's domain
			if parsedUrl, err := url.Parse(downloadUrl); err == nil {
				origin := fmt.Sprintf("%s://%s", parsedUrl.Scheme, parsedUrl.Host)
				args = append(args, "--referer", origin+"/")
				args = append(args, "--add-header", "Origin: "+origin)
			}
			// Add a standard User-Agent to prevent 404/403 errors from generic extractors
			args = append(args, "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36")
			
			cmd = exec.CommandContext(ctx, GetDependencyPath("yt-dlp"), args...)
		} else {
			// Classic multi-connection downloader via aria2c
			filename := extractFilename(downloadUrl)
			
			titleToUse := itemTitle
			if titleToUse == "" || titleToUse == "Video" {
				if filename != "" {
					titleToUse = strings.TrimSuffix(filename, filepath.Ext(filename))
				}
			}
			
			if titleToUse == "" || titleToUse == "Video" {
				titleToUse = fmt.Sprintf("Video_%d", time.Now().Unix())
			}
			
			// Use title with original extension
			ext := filepath.Ext(filename)
			if ext == "" {
				ext = ".mp4"
			}
			filename = sanitizeFilename(titleToUse) + ext
			
			downloadPath := filepath.Join(homeDir, "Downloads") // aria2c takes dir and file separately

			a.mu.Lock()
			for i, item := range a.downloads {
				if item.ID == id {
					a.downloads[i].Destination = filepath.Join(downloadPath, filename)
					if itemTitle == "" || itemTitle == "Video" {
						a.downloads[i].Title = titleToUse
					}
					if a.wailsApp != nil {
						a.wailsApp.Event.Emit("download_updated", a.downloads[i])
					}
					break
				}
			}
			a.mu.Unlock()

			threads := fmt.Sprintf("%d", GlobalConfig.ConcurrentFragments)
			args := []string{
				"-x", threads,
				"-s", threads,
				"-k", "1M",
				"--file-allocation=none",
				"-d", downloadPath,
				"-o", filename,
			}

			// Same for aria2c
			if parsedUrl, err := url.Parse(downloadUrl); err == nil {
				origin := fmt.Sprintf("%s://%s", parsedUrl.Scheme, parsedUrl.Host)
				args = append(args, fmt.Sprintf("--referer=%s/", origin))
				args = append(args, "--header", "Origin: "+origin)
			}
			args = append(args, "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36")

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
				
				// Do not override destination from yt-dlp output, as we already set it properly up-front.

				isProgress := a.parseProgressLine(id, text, &lastEmitMs)
				// Only log non-progress lines to avoid flooding
				if !isProgress {
					a.Logf("%s\n", text)
					if a.wailsApp != nil {
						a.wailsApp.Event.Emit("download_log", map[string]string{
							"id":      id,
							"message": text,
						})
					}
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
					if a.wailsApp != nil {
						a.wailsApp.Event.Emit("download_log", map[string]string{
							"id":      id,
							"message": text,
						})
					}
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
			// If status is already cancelled or paused, don't overwrite it
			if a.downloads[itemIndex].Status == "cancelled" || a.downloads[itemIndex].Status == "paused" {
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
			a.saveHistory()
		}
	}()
}
