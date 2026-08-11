package main

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
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

func getDownloadDir() string {
	home, _ := os.UserHomeDir()
	dir := filepath.Join(home, "Downloads")
	os.MkdirAll(dir, 0755)
	return dir
}

var ansiRegex = regexp.MustCompile(`\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\([a-zA-Z]|\)]|[0-9A-Za-z=><])`)
var ytdlpRegex = regexp.MustCompile(`\[download\]\s+([\d\.]+)%\s+of\s+~?\s*([\d\.]+\s*\w+)(?:.*?\s+at\s+([\d\.]+\s*\w+))?`)
var aria2cRegex = regexp.MustCompile(`\[#[a-fA-F0-9]+\s+([\d\.]+\s*\w+)/([\d\.]+\s*\w+)\s*\(([\d\.]+)%\)(?:.*?\s+DL:([\d\.]+\s*\w+))?`)
var ytDlpDestRegex = regexp.MustCompile(`\[download\] Destination: (.*)`)
var ytDlpAlreadyDestRegex = regexp.MustCompile(`\[download\] (.*) has already been downloaded`)
var ytDlpMergerRegex = regexp.MustCompile(`\[Merger\] Merging formats into "(.*)"`)
var ytDlpMoveFilesRegex = regexp.MustCompile(`\[MoveFiles\] Moving file .*? to "(.*)"`)

// ServerProbeResult holds the results of probing a server
type ServerProbeResult struct {
	SpeedBytesPerSecond int64  // Measured download speed in bytes per second
	SupportsRange       bool   // Whether the server supports HTTP Range requests
	ContentLength       int64  // Total file size from Content-Length header
	UserAgent           string // User agent to use for the download
}

// probeServer performs a quick HEAD + small GET request to measure server speed and capabilities
func (a *App) probeServer(downloadUrl string) *ServerProbeResult {
	result := &ServerProbeResult{
		SpeedBytesPerSecond: 0,
		SupportsRange:       true, // Assume true by default, let aria2c/yt-dlp handle it
		ContentLength:       0,
		UserAgent:           "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
	}

	client := &http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{
			MaxIdleConns:       10,
			IdleConnTimeout:    30 * time.Second,
			DisableCompression: true,
		},
	}

	// 1. HEAD request to check capabilities (optional, don't fail if it doesn't work)
	headReq, _ := http.NewRequest("HEAD", downloadUrl, nil)
	headReq.Header.Set("User-Agent", result.UserAgent)

	headResp, headErr := client.Do(headReq)
	if headErr == nil {
		defer headResp.Body.Close()
		
		// Check Content-Length
		if cl := headResp.Header.Get("Content-Length"); cl != "" {
			fmt.Sscanf(cl, "%d", &result.ContentLength)
		}

		// Check Accept-Ranges
		if ar := headResp.Header.Get("Accept-Ranges"); ar != "bytes" {
			result.SupportsRange = false
		}
	} else {
		a.Logf("Probe HEAD skipped: %v\n", headErr)
	}

	// 2. GET request to measure speed (download small chunk)
	probeSize := int64(1 * 1024 * 1024) // Fixed 1 MB to avoid rate limiting
	if GlobalConfig.ProbeSizeMB > 0 && GlobalConfig.ProbeSizeMB <= 3 {
		probeSize = int64(GlobalConfig.ProbeSizeMB * 1024 * 1024)
	}

	getReq, _ := http.NewRequest("GET", downloadUrl, nil)
	getReq.Header.Set("User-Agent", result.UserAgent)
	if result.SupportsRange {
		getReq.Header.Set("Range", fmt.Sprintf("bytes=0-%d", probeSize-1))
	}

	start := time.Now()
	resp, getErr := client.Do(getReq)
	if getErr != nil {
		a.Logf("Probe GET skipped: %v\n", getErr)
		return result
	}
	defer func() {
		resp.Body.Close()
	}()

	// Read probe data with timeout
	buf := make([]byte, 32*1024) // 32 KB buffer
	totalRead := int64(0)
	maxTime := 3 * time.Second // Max 3 seconds for probe
	
	for totalRead < probeSize && time.Since(start) < maxTime {
		n, err := resp.Body.Read(buf)
		if err == io.EOF || err == io.ErrUnexpectedEOF {
			if n > 0 {
				totalRead += int64(n)
			}
			break
		}
		if err != nil {
			a.Logf("Probe read error: %v\n", err)
			break
		}
		totalRead += int64(n)
	}

	duration := time.Since(start).Seconds()
	if duration > 0 && totalRead > 0 {
		result.SpeedBytesPerSecond = int64(float64(totalRead) / duration)
	}

	a.Logf("Probe complete: read=%d bytes, time=%.2fs, speed=%d KB/s, range=%v\n",
		totalRead, duration, result.SpeedBytesPerSecond/1024, result.SupportsRange)

	return result
}

// decideThreads determines optimal thread count based on probe results and user config
func (a *App) decideThreads(probe *ServerProbeResult, baseThreads int) int {
	if probe == nil || !GlobalConfig.EnableProbe {
		return baseThreads
	}

	// If server doesn't support Range, use 1 connection
	if !probe.SupportsRange {
		a.Logf("Server doesn't support Range, using 1 connection\n")
		return 1
	}

	// If speed is very low, increase connections (max 16)
	if probe.SpeedBytesPerSecond < 200*1024 { // < 200 KB/s
		threads := baseThreads * 4
		if threads > 16 {
			threads = 16
		}
		a.Logf("Slow connection (%d KB/s), increasing threads to %d\n",
			probe.SpeedBytesPerSecond/1024, threads)
		return threads
	}

	// If speed is moderate, double connections
	if probe.SpeedBytesPerSecond < 500*1024 { // 200-500 KB/s
		threads := baseThreads * 2
		if threads > 12 {
			threads = 12
		}
		a.Logf("Moderate connection (%d KB/s), increasing threads to %d\n",
			probe.SpeedBytesPerSecond/1024, threads)
		return threads
	}

	// If speed is very high, reduce connections (min 2)
	if probe.SpeedBytesPerSecond > 5*1024*1024 { // > 5 MB/s
		threads := baseThreads / 2
		if threads < 2 {
			threads = 2
		}
		a.Logf("Fast connection (%d KB/s), reducing threads to %d\n",
			probe.SpeedBytesPerSecond/1024, threads)
		return threads
	}

	// Normal speed, use base threads
	a.Logf("Normal connection (%d KB/s), using %d threads\n",
		probe.SpeedBytesPerSecond/1024, baseThreads)
	return baseThreads
}

// isProgressLine returns true if the line contains download progress info (regex match)
func isProgressLine(line string) bool {
	clean := ansiRegex.ReplaceAllString(line, "")
	clean = strings.TrimSpace(clean)
	if strings.HasPrefix(clean, "*** Download Progress Summary") || 
	   strings.HasPrefix(clean, "===") || 
	   strings.HasPrefix(clean, "---") || 
	   strings.HasPrefix(clean, "FILE:") {
		return true
	}
	return ytdlpRegex.MatchString(clean) || aria2cRegex.MatchString(clean)
}

func parseSizeToBytes(sizeStr string) int64 {
	clean := strings.TrimSpace(sizeStr)
	var val float64
	var unit string
	n, _ := fmt.Sscanf(clean, "%f%s", &val, &unit)
	if n < 1 || val <= 0 {
		return 0
	}
	unit = strings.ToUpper(unit)
	if strings.HasPrefix(unit, "G") {
		return int64(val * 1024 * 1024 * 1024)
	}
	if strings.HasPrefix(unit, "M") {
		return int64(val * 1024 * 1024)
	}
	if strings.HasPrefix(unit, "K") {
		return int64(val * 1024)
	}
	if strings.HasPrefix(unit, "B") {
		return int64(val)
	}
	return int64(val * 1024 * 1024)
}

func (a *App) parseProgressLine(id string, line string, lastEmitMs *int64) bool {
	cleanLine := ansiRegex.ReplaceAllString(line, "")
	cleanLine = strings.TrimSpace(cleanLine)
	isProgress := isProgressLine(cleanLine)
	if !isProgress {
		return false
	}

	// Throttle event emission to at most 4 per second (250ms) to avoid flooding UI while keeping progress smooth
	now := time.Now().UnixMilli()
	last := atomic.LoadInt64(lastEmitMs)
	if now-last < 250 {
		return true // it IS a progress line, but we skip emitting
	}
	atomic.StoreInt64(lastEmitMs, now)

	var pctStr, downloadedStr, totalStr, speedStr string

	if match := ytdlpRegex.FindStringSubmatch(cleanLine); match != nil {
		pctStr = strings.TrimSpace(match[1])
		totalStr = strings.TrimSpace(match[2])
		if len(match) > 3 {
			speedStr = strings.TrimSpace(match[3])
		}
	} else if match := aria2cRegex.FindStringSubmatch(cleanLine); match != nil {
		downloadedStr = strings.TrimSpace(match[1])
		totalStr = strings.TrimSpace(match[2])
		pctStr = strings.TrimSpace(match[3])
		if len(match) > 4 {
			speedStr = strings.TrimSpace(match[4])
			if speedStr != "" && !strings.HasSuffix(speedStr, "/s") && !strings.HasSuffix(speedStr, "/S") {
				speedStr = speedStr + "/s"
			}
		}
	}

	if downloadedStr != "" && totalStr != "" {
		dlB := parseSizeToBytes(downloadedStr)
		totB := parseSizeToBytes(totalStr)
		if totB > 0 && dlB >= 0 {
			calcPct := (float64(dlB) / float64(totB)) * 100.0
			if calcPct >= 0 && calcPct <= 100 {
				pctStr = fmt.Sprintf("%.1f", calcPct)
			}
		}
	}

	if pctStr != "" {
		pctFloat, err := strconv.ParseFloat(pctStr, 64)
		a.mu.Lock()
		for i, item := range a.downloads {
			if item.ID == id {
				if err == nil {
					a.downloads[i].Progress = pctFloat
				}
				if a.downloads[i].StatusMsg == "" || a.downloads[i].StatusMsg == "Writing temporary cookies..." {
					a.downloads[i].StatusMsg = "Downloading..."
				}
				if speedStr != "" {
					a.downloads[i].Speed = speedStr
				}
				if downloadedStr != "" {
					a.downloads[i].DownloadedSize = downloadedStr
				}
				if totalStr != "" {
					a.downloads[i].TotalSize = totalStr
				}
				if a.wailsApp != nil {
					a.wailsApp.Event.Emit("download_updated", a.downloads[i])
				}
				break
			}
		}
		a.mu.Unlock()

		if a.wailsApp != nil {
			payload := map[string]interface{}{
				"id":         id,
				"percentage": pctStr,
				"total":      totalStr,
				"speed":      speedStr,
			}
			if downloadedStr != "" {
				payload["downloaded"] = downloadedStr
			}
			a.wailsApp.Event.Emit("download_progress", payload)
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
			
			var formatId string
			for _, item := range a.downloads {
				if item.ID == id {
					formatId = item.FormatID
					break
				}
			}

			args := []string{
				downloadUrl, 
				"-P", "home:" + downloadDir,
				"-P", "temp:" + tempDir,
				"-o", outName,
				"--js-runtimes", "node",
				"--downloader", aria2cPath, 
				"--downloader-args", fmt.Sprintf("aria2c:-x %s -s %s -k 1M --min-split-size=1M --file-allocation=none --summary-interval=1", threads, threads),
				"--retry-sleep", "fragment:2",
				"--retry-sleep", "http:2",
			}

			if formatId != "" {
				args = append(args, "-f", formatId)
			}

			if itemPageUrl != "" {
				args = append(args, "--referer", itemPageUrl)
			}
			cmd = exec.CommandContext(ctx, GetDependencyPath("yt-dlp"), args...)
		} else if isHLS(downloadUrl) {
			// 🔍 PROBE: Measure server speed for HLS
			probe := a.probeServer(downloadUrl)
			hlsThreads := a.decideThreads(probe, GlobalConfig.ConcurrentFragments)
			threads := fmt.Sprintf("%d", hlsThreads)
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

			// 🔍 PROBE: Measure server speed and capabilities
			if GlobalConfig.EnableProbe && a.wailsApp != nil {
				a.wailsApp.Event.Emit("probe_start", map[string]interface{}{
					"id": id,
				})
			}
			probe := a.probeServer(downloadUrl)
			threads := a.decideThreads(probe, GlobalConfig.ConcurrentFragments)
			if GlobalConfig.EnableProbe && a.wailsApp != nil {
				a.wailsApp.Event.Emit("probe_complete", map[string]interface{}{
					"id":      id,
					"speed":   probe.SpeedBytesPerSecond,
					"threads": threads,
				})
			}
			threadsStr := fmt.Sprintf("%d", threads)
			// Brief pause after probe to avoid rate limiting
			if GlobalConfig.EnableProbe {
				time.Sleep(1 * time.Second)
			}

			args := []string{
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

		cmd.Env = append(os.Environ(), "PYTHONUNBUFFERED=1")
		a.Logf("Executing command: %s %s\n", cmd.Path, strings.Join(cmd.Args, " "))

		stdout, err := cmd.StdoutPipe()
		if err != nil {
			a.Logf("Failed to create stdout pipe: %v\n", err)
			return
		}
		stderr, err := cmd.StderrPipe()
		if err != nil {
			a.Logf("Failed to create stderr pipe: %v\n", err)
			return
		}

		if err := cmd.Start(); err != nil {
			a.Logf("Failed to start command: %v\n", err)
			// Update status to error
			a.mu.Lock()
			for i, item := range a.downloads {
				if item.ID == id {
					a.downloads[i].Status = "error"
					a.downloads[i].StatusMsg = "Failed to start command"
					if a.wailsApp != nil {
						a.wailsApp.Event.Emit("download_updated", a.downloads[i])
					}
					break
				}
			}
			a.mu.Unlock()
			return
		}
		a.Logf("Command started successfully\n")

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

		extractStatusMsg := func(text string) string {
			if strings.HasPrefix(text, "[youtube]") {
				parts := strings.SplitN(text, ":", 2)
				if len(parts) > 1 {
					return strings.TrimSpace(parts[1])
				}
				return text
			}
			if strings.HasPrefix(text, "[info]") {
				parts := strings.SplitN(text, ":", 2)
				if len(parts) > 1 {
					return strings.TrimSpace(parts[1])
				}
				return text
			}
			if strings.HasPrefix(text, "[download] Destination:") {
				return "Downloading..."
			}
			if strings.HasPrefix(text, "[download] Writing temporary cookies") {
				return "Writing temporary cookies..."
			}
			if strings.HasPrefix(text, "[Fixup") {
				return "Fixing media container..."
			}
			if strings.HasPrefix(text, "[MoveFiles]") {
				return "Moving file to Downloads..."
			}
			if strings.HasPrefix(text, "[Merger]") {
				return "Merging audio & video..."
			}
			return ""
		}

		updateItemStatusMsg := func(stMsg string) {
			if stMsg == "" {
				return
			}
			a.mu.Lock()
			for i, item := range a.downloads {
				if item.ID == id {
					if a.downloads[i].StatusMsg != stMsg {
						a.downloads[i].StatusMsg = stMsg
						if a.wailsApp != nil {
							a.wailsApp.Event.Emit("download_updated", a.downloads[i])
						}
					}
					break
				}
			}
			a.mu.Unlock()
		}

		var wg sync.WaitGroup
		wg.Add(2)

		go func() {
			defer wg.Done()
			scanner := bufio.NewScanner(stdout)
			scanner.Split(splitCRLF)
			for scanner.Scan() {
				text := strings.TrimSpace(scanner.Text())
				text = ansiRegex.ReplaceAllString(text, "")
				text = strings.TrimSpace(text)
				if text == "" {
					continue
				}
				
				// Capture actual output file path from yt-dlp
				var destFile string
				if match := ytDlpMoveFilesRegex.FindStringSubmatch(text); match != nil {
					destFile = strings.TrimSpace(match[1])
				} else if match := ytDlpDestRegex.FindStringSubmatch(text); match != nil {
					destFile = strings.TrimSpace(match[1])
				} else if match := ytDlpAlreadyDestRegex.FindStringSubmatch(text); match != nil {
					destFile = strings.TrimSpace(match[1])
				} else if match := ytDlpMergerRegex.FindStringSubmatch(text); match != nil {
					destFile = strings.TrimSpace(match[1])
				}

				if destFile != "" {
					a.mu.Lock()
					for i, item := range a.downloads {
						if item.ID == id {
							a.downloads[i].Destination = destFile
							base := filepath.Base(destFile)
							ext := filepath.Ext(base)
							titleFromDest := strings.TrimSuffix(base, ext)
							if a.downloads[i].Title == "" || a.downloads[i].Title == "Video" || a.downloads[i].Title == "YouTube Video" {
								a.downloads[i].Title = titleFromDest
							}
							if a.wailsApp != nil {
								a.wailsApp.Event.Emit("download_updated", a.downloads[i])
							}
							break
						}
					}
					a.mu.Unlock()
					a.saveHistory()
				}

				isProgress := a.parseProgressLine(id, text, &lastEmitMs)
				// Only log non-progress lines to avoid flooding
				if !isProgress {
					ts := time.Now().Format("15:04:05")
					logMsg := fmt.Sprintf("[%s] %s", ts, text)
					a.Logf("%s\n", text)
					a.SaveDownloadLog(id, logMsg)
					updateItemStatusMsg(extractStatusMsg(text))
					if a.wailsApp != nil {
						a.wailsApp.Event.Emit("download_log", map[string]string{
							"id":      id,
							"message": logMsg,
						})
					}
				}
			}
		}()

		go func() {
			defer wg.Done()
			scanner := bufio.NewScanner(stderr)
			scanner.Split(splitCRLF)
			for scanner.Scan() {
				text := strings.TrimSpace(scanner.Text())
				text = ansiRegex.ReplaceAllString(text, "")
				text = strings.TrimSpace(text)
				if text == "" {
					continue
				}
				// Try to parse as progress first (some lines go to stderr)
				isProgress := a.parseProgressLine(id, text, &lastEmitMs)
				// Skip repetitive 429 retry lines and progress lines from the terminal log
				if !isProgress && !strings.Contains(text, "Retrying fragment") {
					ts := time.Now().Format("15:04:05")
					logMsg := fmt.Sprintf("[%s] %s", ts, text)
					a.Logf("%s\n", text)
					a.SaveDownloadLog(id, logMsg)
					updateItemStatusMsg(extractStatusMsg(text))
					if a.wailsApp != nil {
						a.wailsApp.Event.Emit("download_log", map[string]string{
							"id":      id,
							"message": logMsg,
						})
					}
				}
			}
		}()

		err = cmd.Wait()
		wg.Wait()

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
				a.downloads[itemIndex].StatusMsg = fmt.Sprintf("Error: %v", err)
			} else {
				a.Logf("Download completed for %s\n", downloadUrl)
				a.downloads[itemIndex].Status = "completed"
				a.downloads[itemIndex].StatusMsg = "Completed"

				// Ensure destination points to final file in Downloads folder
				dest := a.downloads[itemIndex].Destination
				downloadDir := getDownloadDir()
				if dest == "" || strings.Contains(dest, ".vdm/temp") {
					baseName := filepath.Base(dest)
					if baseName == "" || baseName == "." {
						baseName = sanitizeFilename(a.downloads[itemIndex].Title) + ".mp4"
					}
					finalPath := filepath.Join(downloadDir, baseName)
					if _, statErr := os.Stat(finalPath); statErr == nil {
						a.downloads[itemIndex].Destination = finalPath
					} else {
						// Look for any matching file in Downloads dir
						files, _ := os.ReadDir(downloadDir)
						stem := strings.TrimSuffix(baseName, filepath.Ext(baseName))
						for _, f := range files {
							if stem != "" && strings.HasPrefix(f.Name(), stem) {
								a.downloads[itemIndex].Destination = filepath.Join(downloadDir, f.Name())
								break
							}
						}
					}
				}
			}

			if a.wailsApp != nil {
				a.wailsApp.Event.Emit("download_updated", a.downloads[itemIndex])
			}
			a.saveHistory()
		}
	}()
}
