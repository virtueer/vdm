package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
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

	notify := m.notifyRetry(id)

	// Probe the URL for range support and content length. A rate limited probe
	// is retried too, otherwise a 429 here would silently downgrade a resumable
	// multi-part download to a single stream.
	var totalBytes int64 = -1
	var supportsRange = false

	probeResp, err := doWithRetry(ctx, probeAttempts, func() (*http.Request, error) {
		return mediaRequest(ctx, "HEAD", downloadUrl)
	}, notify)
	if err == nil {
		if probeResp.StatusCode == http.StatusOK || probeResp.StatusCode == http.StatusPartialContent {
			totalBytes = probeResp.ContentLength
			if strings.EqualFold(probeResp.Header.Get("Accept-Ranges"), "bytes") || probeResp.StatusCode == http.StatusPartialContent {
				supportsRange = true
			}
		}
		probeResp.Body.Close()
	} else if ctx.Err() != nil {
		return ctx.Err()
	}

	// Double check with a 0-0 Range probe if HEAD was inconclusive
	if !supportsRange || totalBytes <= 0 {
		rangeResp, err := doWithRetry(ctx, probeAttempts, func() (*http.Request, error) {
			req, err := mediaRequest(ctx, "GET", downloadUrl)
			if err != nil {
				return nil, err
			}
			req.Header.Set("Range", "bytes=0-0")
			return req, nil
		}, notify)
		if err == nil {
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
		} else if ctx.Err() != nil {
			return ctx.Err()
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
					m.downloads[i].StatusMsg = fmt.Sprintf("Turbo · %d bağlantı", numWorkers)
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
				"statusMsg":  fmt.Sprintf("Turbo · %d bağlantı", numWorkers),
			})
		}

		lastReportTime = now
		lastReportBytes = currentBytes
	}

	notify := m.notifyRetry(id)

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

			buf := make([]byte, 256*1024)
			attempt := 0

			// Each pass fetches whatever is left of this part. A dropped
			// connection, a rate limit or a truncated body only costs a backoff
			// and a new Range request from the current offset.
			for curStart <= part.EndOffset {
				if ctx.Err() != nil {
					return
				}

				from := curStart
				resp, err := doWithRetry(ctx, maxRetryAttempts, func() (*http.Request, error) {
					req, reqErr := mediaRequest(ctx, "GET", downloadUrl)
					if reqErr != nil {
						return nil, reqErr
					}
					req.Header.Set("Range", fmt.Sprintf("bytes=%d-%d", from, part.EndOffset))
					return req, nil
				}, notify)
				if err != nil {
					if ctx.Err() == nil {
						errOnce.Do(func() { firstErr = err })
					}
					return
				}

				if resp.StatusCode != http.StatusPartialContent && resp.StatusCode != http.StatusOK {
					resp.Body.Close()
					errOnce.Do(func() { firstErr = fmt.Errorf("worker %d bad status: %s", workerIndex, resp.Status) })
					return
				}

				var written int64
				var streamErr error

				for {
					if ctx.Err() != nil {
						resp.Body.Close()
						return
					}

					n, readErr := resp.Body.Read(buf)
					if n > 0 {
						if _, writeErr := file.WriteAt(buf[:n], curStart); writeErr != nil {
							resp.Body.Close()
							errOnce.Do(func() { firstErr = writeErr })
							return
						}
						curStart += int64(n)
						written += int64(n)
						atomic.AddInt64(&totalDownloaded, int64(n))

						stateMu.Lock()
						state.Parts[workerIndex].Downloaded += int64(n)
						stateMu.Unlock()

						reportProgress(false)
					}

					if readErr != nil {
						if readErr != io.EOF {
							streamErr = readErr
						}
						break
					}
				}
				resp.Body.Close()

				if streamErr == nil {
					if curStart > part.EndOffset {
						return
					}
					// The body ended before the range did: resume the remainder
					// instead of leaving a hole in the file.
					streamErr = fmt.Errorf("stream ended early at %d/%d", curStart, part.EndOffset)
				}

				if !retryableError(ctx, streamErr) {
					if ctx.Err() == nil {
						errOnce.Do(func() { firstErr = streamErr })
					}
					return
				}

				// Bytes landed, so the connection was healthy for a while and the
				// budget starts over; a loop that makes no progress still ends.
				if written > 0 {
					attempt = 0
				}
				attempt++
				if attempt > maxRetryAttempts {
					errOnce.Do(func() {
						firstErr = fmt.Errorf("worker %d: %d denemeden sonra vazgeçildi: %w", workerIndex, maxRetryAttempts, streamErr)
					})
					return
				}

				wait := retryDelay(attempt, "")
				notify(attempt, wait, streamErr.Error())
				if sleepErr := sleepCtx(ctx, wait); sleepErr != nil {
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

// downloadSingleStream downloads without ranges, or with a single resuming
// range when the server allows it. Each pass appends what it can; a failure only
// costs a backoff before the next pass picks up from the current file size.
func (m *Manager) downloadSingleStream(ctx context.Context, id, downloadUrl, dest, partFile string, totalBytes int64) error {
	notify := m.notifyRetry(id)
	attempt := 0

	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		var existingBytes int64
		if fi, err := os.Stat(partFile); err == nil {
			existingBytes = fi.Size()
		}

		resp, err := doWithRetry(ctx, maxRetryAttempts, func() (*http.Request, error) {
			req, reqErr := mediaRequest(ctx, "GET", downloadUrl)
			if reqErr != nil {
				return nil, reqErr
			}
			if existingBytes > 0 {
				req.Header.Set("Range", fmt.Sprintf("bytes=%d-", existingBytes))
			}
			return req, nil
		}, notify)
		if err != nil {
			return err
		}

		// Only transient failures belong in this loop: a status the retry helper
		// already refused to retry is permanent and ends the download.
		if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusPartialContent {
			resp.Body.Close()
			return fmt.Errorf("HTTP error: %s", resp.Status)
		}

		written, discovered, streamErr := m.streamToPartFile(ctx, id, resp, partFile, existingBytes, totalBytes)
		totalBytes = discovered

		if streamErr == nil {
			break
		}
		if !retryableError(ctx, streamErr) {
			return streamErr
		}

		// Bytes landed, so the connection was healthy for a while and the budget
		// starts over; a loop that makes no progress still ends.
		if written > 0 {
			attempt = 0
		}
		attempt++
		if attempt > maxRetryAttempts {
			return fmt.Errorf("%d denemeden sonra vazgeçildi: %w", maxRetryAttempts, streamErr)
		}

		wait := retryDelay(attempt, "")
		notify(attempt, wait, streamErr.Error())
		if err := sleepCtx(ctx, wait); err != nil {
			return err
		}
	}

	if err := os.Rename(partFile, dest); err != nil {
		return fmt.Errorf("failed to finalize file: %w", err)
	}

	return nil
}

// streamToPartFile consumes one response into the .part file, reporting progress
// as it goes. It returns the bytes written by this pass, the best known total
// size, and the error that ended the pass (nil when the file is complete).
func (m *Manager) streamToPartFile(
	ctx context.Context,
	id string,
	resp *http.Response,
	partFile string,
	existingBytes int64,
	totalBytes int64,
) (int64, int64, error) {
	defer resp.Body.Close()

	var file *os.File
	var err error
	var currentDownloaded int64

	switch {
	case resp.StatusCode == http.StatusPartialContent:
		file, err = os.OpenFile(partFile, os.O_WRONLY|os.O_APPEND|os.O_CREATE, 0644)
		if err != nil {
			return 0, totalBytes, fmt.Errorf("failed to open partial file: %w", err)
		}
		currentDownloaded = existingBytes
		if resp.ContentLength > 0 {
			totalBytes = existingBytes + resp.ContentLength
		}
	case resp.StatusCode == http.StatusOK:
		// No range support: the server restarts the file, so we do too.
		file, err = os.OpenFile(partFile, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
		if err != nil {
			return 0, totalBytes, fmt.Errorf("failed to create file: %w", err)
		}
		currentDownloaded = 0
		totalBytes = resp.ContentLength
	default:
		return 0, totalBytes, fmt.Errorf("HTTP error: %s", resp.Status)
	}
	defer file.Close()

	buf := make([]byte, 256*1024)
	lastReportTime := time.Now()
	lastReportBytes := currentDownloaded
	var written int64

	for {
		select {
		case <-ctx.Done():
			return written, totalBytes, ctx.Err()
		default:
		}

		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			if _, writeErr := file.Write(buf[:n]); writeErr != nil {
				return written, totalBytes, fmt.Errorf("write error: %w", writeErr)
			}
			currentDownloaded += int64(n)
			written += int64(n)
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
			if readErr != io.EOF {
				return written, totalBytes, readErr
			}
			// A body that ends short of the announced size was truncated, so the
			// caller resumes rather than renaming an incomplete file.
			if totalBytes > 0 && currentDownloaded < totalBytes {
				return written, totalBytes, fmt.Errorf("stream ended early at %d/%d bytes", currentDownloaded, totalBytes)
			}
			return written, totalBytes, nil
		}
	}
}
