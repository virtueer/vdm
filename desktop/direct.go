package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type PartState struct {
	Index       int   `json:"index"`
	StartOffset int64 `json:"startOffset"`
	EndOffset   int64 `json:"endOffset"`
	Downloaded  int64 `json:"downloaded"`
}

type MultiPartState struct {
	TotalBytes int64       `json:"totalBytes"`
	Parts      []PartState `json:"parts"`
}

func (m *Manager) downloadDirect(ctx context.Context, id, downloadUrl, dest string) error {
	partFile := dest + ".part"
	stateFile := dest + ".vdm_state"

	// Probe remote URL for range support & content length
	probeReq, err := http.NewRequestWithContext(ctx, "HEAD", downloadUrl, nil)
	if err != nil {
		return fmt.Errorf("request creation failed: %w", err)
	}
	probeReq.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36")
	if parsedUrl, err := url.Parse(downloadUrl); err == nil {
		origin := fmt.Sprintf("%s://%s", parsedUrl.Scheme, parsedUrl.Host)
		probeReq.Header.Set("Referer", origin+"/")
		probeReq.Header.Set("Origin", origin)
	}

	var totalBytes int64 = -1
	var supportsRange = false

	if probeResp, err := defaultClient.Do(probeReq); err == nil {
		if probeResp.StatusCode == http.StatusOK || probeResp.StatusCode == http.StatusPartialContent {
			totalBytes = probeResp.ContentLength
			if strings.EqualFold(probeResp.Header.Get("Accept-Ranges"), "bytes") || probeResp.StatusCode == http.StatusPartialContent {
				supportsRange = true
			}
		}
		probeResp.Body.Close()
	}

	// Double check with a 0-0 Range probe if HEAD was inconclusive
	if !supportsRange || totalBytes <= 0 {
		rangeReq, err := http.NewRequestWithContext(ctx, "GET", downloadUrl, nil)
		if err == nil {
			rangeReq.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36")
			rangeReq.Header.Set("Range", "bytes=0-0")
			if rangeResp, err := defaultClient.Do(rangeReq); err == nil {
				if rangeResp.StatusCode == http.StatusPartialContent {
					supportsRange = true
					cr := rangeResp.Header.Get("Content-Range")
					if slashIdx := strings.LastIndex(cr, "/"); slashIdx != -1 {
						if parsedLen, err := strconv.ParseInt(cr[slashIdx+1:], 10, 64); err == nil {
							totalBytes = parsedLen
						}
					}
				} else if rangeResp.StatusCode == http.StatusOK {
					totalBytes = rangeResp.ContentLength
				}
				rangeResp.Body.Close()
			}
		}
	}

	// Use multi-part range downloading (8 to 16 parallel threads) if supported and >= 4MB
	if supportsRange && totalBytes >= 4*1024*1024 {
		return m.downloadMultipartRange(ctx, id, downloadUrl, dest, partFile, stateFile, totalBytes)
	}

	// Fallback to single stream download
	return m.downloadSingleStream(ctx, id, downloadUrl, dest, partFile, totalBytes)
}

func (m *Manager) downloadMultipartRange(ctx context.Context, id, downloadUrl, dest, partFile, stateFile string, totalBytes int64) error {
	numWorkers := 8
	if totalBytes >= 30*1024*1024 {
		numWorkers = 16
	}

	var state MultiPartState
	var isResumed bool

	if stateData, err := os.ReadFile(stateFile); err == nil {
		if json.Unmarshal(stateData, &state) == nil && state.TotalBytes == totalBytes && len(state.Parts) > 0 {
			isResumed = true
			numWorkers = len(state.Parts)
		}
	}

	if !isResumed {
		partSize := totalBytes / int64(numWorkers)
		state = MultiPartState{
			TotalBytes: totalBytes,
			Parts:      make([]PartState, numWorkers),
		}
		for i := 0; i < numWorkers; i++ {
			start := int64(i) * partSize
			end := start + partSize - 1
			if i == numWorkers-1 {
				end = totalBytes - 1
			}
			state.Parts[i] = PartState{
				Index:       i,
				StartOffset: start,
				EndOffset:   end,
				Downloaded:  0,
			}
		}
	}

	file, err := os.OpenFile(partFile, os.O_CREATE|os.O_RDWR, 0644)
	if err != nil {
		return fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	if !isResumed {
		_ = file.Truncate(totalBytes)
	}

	var totalDownloaded int64
	for _, p := range state.Parts {
		totalDownloaded += p.Downloaded
	}

	var stateMu sync.Mutex
	saveState := func() {
		stateMu.Lock()
		defer stateMu.Unlock()
		if data, err := json.Marshal(state); err == nil {
			_ = os.WriteFile(stateFile, data, 0644)
		}
	}

	totStr := formatBytes(totalBytes)
	lastReportTime := time.Now()
	lastReportBytes := atomic.LoadInt64(&totalDownloaded)

	reportProgress := func(force bool) {
		now := time.Now()
		if !force && now.Sub(lastReportTime) < 250*time.Millisecond {
			return
		}

		currentBytes := atomic.LoadInt64(&totalDownloaded)
		pct := (float64(currentBytes) / float64(totalBytes)) * 100.0
		if pct > 100 {
			pct = 100
		}

		duration := now.Sub(lastReportTime).Seconds()
		if duration <= 0 {
			duration = 0.25
		}
		bytesDiff := currentBytes - lastReportBytes
		speedBytesPerSec := float64(bytesDiff) / duration

		speedStr := formatSpeed(speedBytesPerSec)
		dlStr := formatBytes(currentBytes)

		m.mu.Lock()
		for i, item := range m.downloads {
			if item.ID == id {
				if m.downloads[i].Status == "downloading" {
					m.downloads[i].Progress = pct
					m.downloads[i].Speed = speedStr
					m.downloads[i].DownloadedSize = dlStr
					m.downloads[i].TotalSize = totStr
					m.downloads[i].StatusMsg = fmt.Sprintf("Turbo (%d connections)...", numWorkers)
				}
				break
			}
		}
		m.mu.Unlock()

		if m.wailsApp != nil {
			m.wailsApp.Event.Emit("download_progress", map[string]interface{}{
				"id":         id,
				"percentage": fmt.Sprintf("%.1f", pct),
				"downloaded": dlStr,
				"total":      totStr,
				"speed":      speedStr,
				"statusMsg":  fmt.Sprintf("Turbo (%d connections)...", numWorkers),
			})
		}

		lastReportTime = now
		lastReportBytes = currentBytes
	}

	var wg sync.WaitGroup
	var firstErr error
	var errOnce sync.Once

	for w := 0; w < numWorkers; w++ {
		workerIndex := w
		wg.Add(1)
		go func() {
			defer wg.Done()

			part := state.Parts[workerIndex]
			curStart := part.StartOffset + part.Downloaded
			if curStart > part.EndOffset {
				return
			}

			req, err := http.NewRequestWithContext(ctx, "GET", downloadUrl, nil)
			if err != nil {
				errOnce.Do(func() { firstErr = err })
				return
			}
			req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36")
			req.Header.Set("Range", fmt.Sprintf("bytes=%d-%d", curStart, part.EndOffset))
			if parsedUrl, err := url.Parse(downloadUrl); err == nil {
				origin := fmt.Sprintf("%s://%s", parsedUrl.Scheme, parsedUrl.Host)
				req.Header.Set("Referer", origin+"/")
				req.Header.Set("Origin", origin)
			}

			resp, err := defaultClient.Do(req)
			if err != nil {
				if ctx.Err() == nil {
					errOnce.Do(func() { firstErr = err })
				}
				return
			}
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusPartialContent && resp.StatusCode != http.StatusOK {
				errOnce.Do(func() { firstErr = fmt.Errorf("worker %d bad status: %s", workerIndex, resp.Status) })
				return
			}

			buf := make([]byte, 256*1024)
			for {
				select {
				case <-ctx.Done():
					return
				default:
				}

				n, readErr := resp.Body.Read(buf)
				if n > 0 {
					writePos := curStart
					if _, writeErr := file.WriteAt(buf[:n], writePos); writeErr != nil {
						errOnce.Do(func() { firstErr = writeErr })
						return
					}
					curStart += int64(n)
					atomic.AddInt64(&totalDownloaded, int64(n))

					stateMu.Lock()
					state.Parts[workerIndex].Downloaded += int64(n)
					stateMu.Unlock()

					reportProgress(false)
				}

				if readErr != nil {
					if readErr == io.EOF {
						break
					}
					if ctx.Err() == nil {
						errOnce.Do(func() { firstErr = readErr })
					}
					return
				}
			}
		}()
	}

	wg.Wait()
	saveState()

	if ctx.Err() != nil {
		return ctx.Err()
	}
	if firstErr != nil {
		return firstErr
	}

	_ = file.Close()
	_ = os.Remove(stateFile)
	if err := os.Rename(partFile, dest); err != nil {
		return fmt.Errorf("failed to finalize file: %w", err)
	}

	return nil
}

func (m *Manager) downloadSingleStream(ctx context.Context, id, downloadUrl, dest, partFile string, totalBytes int64) error {
	var existingBytes int64 = 0
	if fi, err := os.Stat(partFile); err == nil {
		existingBytes = fi.Size()
	}

	req, err := http.NewRequestWithContext(ctx, "GET", downloadUrl, nil)
	if err != nil {
		return fmt.Errorf("request creation failed: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36")
	if parsedUrl, err := url.Parse(downloadUrl); err == nil {
		origin := fmt.Sprintf("%s://%s", parsedUrl.Scheme, parsedUrl.Host)
		req.Header.Set("Referer", origin+"/")
		req.Header.Set("Origin", origin)
	}

	if existingBytes > 0 {
		req.Header.Set("Range", fmt.Sprintf("bytes=%d-", existingBytes))
	}

	resp, err := defaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	var file *os.File
	var currentDownloaded int64 = 0

	if resp.StatusCode == http.StatusPartialContent {
		file, err = os.OpenFile(partFile, os.O_WRONLY|os.O_APPEND, 0644)
		if err != nil {
			return fmt.Errorf("failed to open partial file: %w", err)
		}
		currentDownloaded = existingBytes
		if resp.ContentLength > 0 {
			totalBytes = existingBytes + resp.ContentLength
		}
	} else if resp.StatusCode == http.StatusOK {
		file, err = os.OpenFile(partFile, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
		if err != nil {
			return fmt.Errorf("failed to create file: %w", err)
		}
		currentDownloaded = 0
		totalBytes = resp.ContentLength
	} else {
		return fmt.Errorf("HTTP error: %s", resp.Status)
	}
	defer file.Close()

	buf := make([]byte, 256*1024)
	lastReportTime := time.Now()
	lastReportBytes := currentDownloaded

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			if _, writeErr := file.Write(buf[:n]); writeErr != nil {
				return fmt.Errorf("write error: %w", writeErr)
			}
			currentDownloaded += int64(n)
		}

		now := time.Now()
		if now.Sub(lastReportTime) >= 250*time.Millisecond {
			duration := now.Sub(lastReportTime).Seconds()
			bytesDiff := currentDownloaded - lastReportBytes
			speedBytesPerSec := float64(bytesDiff) / duration

			speedStr := formatSpeed(speedBytesPerSec)
			dlStr := formatBytes(currentDownloaded)
			var totStr string
			if totalBytes > 0 {
				totStr = formatBytes(totalBytes)
			}

			var pct float64 = 0
			if totalBytes > 0 {
				pct = (float64(currentDownloaded) / float64(totalBytes)) * 100.0
				if pct > 100 {
					pct = 100
				}
			}

			m.mu.Lock()
			for i, item := range m.downloads {
				if item.ID == id {
					if m.downloads[i].Status == "downloading" {
						m.downloads[i].Progress = pct
						m.downloads[i].Speed = speedStr
						m.downloads[i].DownloadedSize = dlStr
						if totalBytes > 0 {
							m.downloads[i].TotalSize = totStr
						}
					}
					break
				}
			}
			m.mu.Unlock()

			if m.wailsApp != nil {
				m.wailsApp.Event.Emit("download_progress", map[string]interface{}{
					"id":         id,
					"percentage": fmt.Sprintf("%.1f", pct),
					"downloaded": dlStr,
					"total":      totStr,
					"speed":      speedStr,
				})
			}

			lastReportTime = now
			lastReportBytes = currentDownloaded
		}

		if readErr != nil {
			if readErr == io.EOF {
				break
			}
			return readErr
		}
	}

	_ = file.Close()
	if err := os.Rename(partFile, dest); err != nil {
		return fmt.Errorf("failed to finalize file: %w", err)
	}

	return nil
}
