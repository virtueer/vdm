package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type StreamVariant struct {
	URL        string
	Bandwidth  int
	Resolution string
	Width      int
	Height     int
	AudioGroup string
}

type AudioTrack struct {
	Name     string
	Language string
	URI      string
	GroupID  string
	Default  bool
}

type HLSPlaylist struct {
	IsMaster    bool
	Variants    []StreamVariant
	AudioTracks []AudioTrack
	Segments    []string
	InitSegment string
	BaseURL     *url.URL
}

func isHLSStream(u, probeContent string) bool {
	lowerU := strings.ToLower(u)
	if strings.Contains(lowerU, ".m3u8") ||
		strings.HasSuffix(lowerU, "master.txt") ||
		strings.HasSuffix(lowerU, "playlist.txt") ||
		strings.Contains(lowerU, "/hls/") {
		return true
	}
	trimmed := strings.TrimSpace(probeContent)
	return strings.HasPrefix(trimmed, "#EXTM3U") || strings.HasPrefix(trimmed, "#EXT-X-")
}

func parseHLS(content string, baseURL *url.URL) (*HLSPlaylist, error) {
	lines := strings.Split(content, "\n")
	pl := &HLSPlaylist{
		BaseURL:     baseURL,
		Variants:    []StreamVariant{},
		AudioTracks: []AudioTrack{},
		Segments:    []string{},
	}

	var currentVariant *StreamVariant
	var hasStreamInf bool

	reBandwidth := regexp.MustCompile(`BANDWIDTH=(\d+)`)
	reResolution := regexp.MustCompile(`RESOLUTION=(\d+)x(\d+)`)
	reAudioGroup := regexp.MustCompile(`AUDIO="([^"]+)"`)

	reAudioName := regexp.MustCompile(`NAME="([^"]+)"`)
	reAudioURI := regexp.MustCompile(`URI="([^"]+)"`)
	reAudioGroupID := regexp.MustCompile(`GROUP-ID="([^"]+)"`)
	reAudioDefault := regexp.MustCompile(`DEFAULT=(YES|NO)`)
	reAudioLang := regexp.MustCompile(`LANGUAGE="([^"]+)"`)

	reInitMap := regexp.MustCompile(`URI="([^"]+)"`)

	for _, rawLine := range lines {
		line := strings.TrimSpace(rawLine)
		if line == "" {
			continue
		}

		if strings.HasPrefix(line, "#EXT-X-STREAM-INF:") {
			hasStreamInf = true
			v := StreamVariant{}
			if m := reBandwidth.FindStringSubmatch(line); len(m) > 1 {
				v.Bandwidth, _ = strconv.Atoi(m[1])
			}
			if m := reResolution.FindStringSubmatch(line); len(m) > 2 {
				v.Width, _ = strconv.Atoi(m[1])
				v.Height, _ = strconv.Atoi(m[2])
				v.Resolution = fmt.Sprintf("%dx%d", v.Width, v.Height)
			}
			if m := reAudioGroup.FindStringSubmatch(line); len(m) > 1 {
				v.AudioGroup = m[1]
			}
			currentVariant = &v
		} else if strings.HasPrefix(line, "#EXT-X-MEDIA:TYPE=AUDIO") {
			hasStreamInf = true
			a := AudioTrack{}
			if m := reAudioName.FindStringSubmatch(line); len(m) > 1 {
				a.Name = m[1]
			}
			if m := reAudioURI.FindStringSubmatch(line); len(m) > 1 {
				a.URI = resolveURL(baseURL, m[1])
			}
			if m := reAudioGroupID.FindStringSubmatch(line); len(m) > 1 {
				a.GroupID = m[1]
			}
			if m := reAudioDefault.FindStringSubmatch(line); len(m) > 1 {
				a.Default = (m[1] == "YES")
			}
			if m := reAudioLang.FindStringSubmatch(line); len(m) > 1 {
				a.Language = m[1]
			}
			if a.URI != "" {
				pl.AudioTracks = append(pl.AudioTracks, a)
			}
		} else if strings.HasPrefix(line, "#EXT-X-MAP:") {
			if m := reInitMap.FindStringSubmatch(line); len(m) > 1 {
				pl.InitSegment = resolveURL(baseURL, m[1])
			}
		} else if !strings.HasPrefix(line, "#") {
			if currentVariant != nil {
				currentVariant.URL = resolveURL(baseURL, line)
				pl.Variants = append(pl.Variants, *currentVariant)
				currentVariant = nil
			} else {
				pl.Segments = append(pl.Segments, resolveURL(baseURL, line))
			}
		}
	}

	pl.IsMaster = hasStreamInf && len(pl.Variants) > 0
	return pl, nil
}

func resolveURL(base *url.URL, ref string) string {
	ref = strings.TrimSpace(ref)
	refURL, err := url.Parse(ref)
	if err != nil {
		return ref
	}
	if base == nil {
		return ref
	}
	return base.ResolveReference(refURL).String()
}

func fetchHLSContent(ctx context.Context, targetURL string) (string, *url.URL, error) {
	var lastErr error
	for attempt := 0; attempt < 6; attempt++ {
		select {
		case <-ctx.Done():
			return "", nil, ctx.Err()
		default:
		}

		req, err := http.NewRequestWithContext(ctx, "GET", targetURL, nil)
		if err != nil {
			return "", nil, err
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36")
		req.Header.Set("Accept", "*/*")
		if parsedUrl, err := url.Parse(targetURL); err == nil {
			origin := fmt.Sprintf("%s://%s", parsedUrl.Scheme, parsedUrl.Host)
			req.Header.Set("Referer", origin+"/")
			req.Header.Set("Origin", origin)
		}

		resp, err := defaultClient.Do(req)
		if err != nil {
			lastErr = err
			time.Sleep(time.Duration(1000*(attempt+1)) * time.Millisecond)
			continue
		}

		if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode == http.StatusServiceUnavailable {
			resp.Body.Close()
			lastErr = fmt.Errorf("HLS request rate limited (status: %s)", resp.Status)
			backoff := time.Duration(1500+attempt*1500) * time.Millisecond
			log.Printf("[HLS fetch] Rate limited on %s, waiting %v before retry %d...", targetURL, backoff, attempt+1)
			time.Sleep(backoff)
			continue
		}

		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			return "", nil, fmt.Errorf("HLS request failed with status: %s", resp.Status)
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			lastErr = err
			time.Sleep(500 * time.Millisecond)
			continue
		}

		return string(body), resp.Request.URL, nil
	}
	return "", nil, fmt.Errorf("failed after retries: %w", lastErr)
}

func (m *Manager) downloadHLS(ctx context.Context, id, rawURL, dest string) (err error) {
	log.Printf("[HLS %s] Starting HLS download for %s -> %s", id, rawURL, dest)
	content, actualURL, err := fetchHLSContent(ctx, rawURL)
	if err != nil {
		return fmt.Errorf("failed to fetch playlist: %w", err)
	}

	pl, err := parseHLS(content, actualURL)
	if err != nil {
		return fmt.Errorf("failed to parse playlist: %w", err)
	}

	var videoMediaURL string
	var selectedAudioURL string

	if pl.IsMaster {
		// Pick highest resolution/bandwidth variant
		sort.Slice(pl.Variants, func(i, j int) bool {
			if pl.Variants[i].Height != pl.Variants[j].Height {
				return pl.Variants[i].Height > pl.Variants[j].Height
			}
			return pl.Variants[i].Bandwidth > pl.Variants[j].Bandwidth
		})

		bestVariant := pl.Variants[0]
		videoMediaURL = bestVariant.URL
		log.Printf("[HLS %s] Selected video variant: %s (%dx%d, %d bps)", id, bestVariant.URL, bestVariant.Width, bestVariant.Height, bestVariant.Bandwidth)

		// Pick matching audio track if separate audio group
		if bestVariant.AudioGroup != "" {
			for _, aud := range pl.AudioTracks {
				if aud.GroupID == bestVariant.AudioGroup {
					if aud.Default || selectedAudioURL == "" {
						selectedAudioURL = aud.URI
					}
				}
			}
		}
		if selectedAudioURL == "" && len(pl.AudioTracks) > 0 {
			selectedAudioURL = pl.AudioTracks[0].URI
		}
		if selectedAudioURL != "" {
			log.Printf("[HLS %s] Selected audio track: %s", id, selectedAudioURL)
		}
	} else {
		videoMediaURL = actualURL.String()
	}

	// Fetch video segment playlist
	vContent, vURL, err := fetchHLSContent(ctx, videoMediaURL)
	if err != nil {
		return fmt.Errorf("failed to fetch video sublist: %w", err)
	}
	videoPL, err := parseHLS(vContent, vURL)
	if err != nil || len(videoPL.Segments) == 0 {
		return fmt.Errorf("no video segments found in playlist")
	}

	// Fetch audio segment playlist if exists
	var audioPL *HLSPlaylist
	var aContent string
	if selectedAudioURL != "" && selectedAudioURL != videoMediaURL {
		var aURL *url.URL
		var fetchErr error
		aContent, aURL, fetchErr = fetchHLSContent(ctx, selectedAudioURL)
		if fetchErr == nil {
			aParsed, err := parseHLS(aContent, aURL)
			if err == nil && len(aParsed.Segments) > 0 {
				audioPL = aParsed
			}
		}
	}

	totalVideoSegments := len(videoPL.Segments)
	totalAudioSegments := 0
	if audioPL != nil {
		totalAudioSegments = len(audioPL.Segments)
	}
	totalSegments := totalVideoSegments + totalAudioSegments
	log.Printf("[HLS %s] Found %d video segments and %d audio segments (Total: %d)", id, totalVideoSegments, totalAudioSegments, totalSegments)

	// Use temporary directory inside destination folder on the storage drive (NOT RAM /tmp)
	destDir := filepath.Dir(dest)
	tempDir := filepath.Join(destDir, fmt.Sprintf(".vdm_tmp_%s", id))
	_ = os.MkdirAll(filepath.Join(tempDir, "video"), 0755)
	if audioPL != nil {
		_ = os.MkdirAll(filepath.Join(tempDir, "audio"), 0755)
	}
	defer func() {
		if ctx.Err() == nil && err == nil {
			log.Printf("[HLS %s] Cleaning up temp directory: %s", id, tempDir)
			_ = os.RemoveAll(tempDir)
		} else {
			log.Printf("[HLS %s] Preserving downloaded chunks in %s for resume", id, tempDir)
		}
	}()

	var downloadedBytes int64
	var completedSegments int64
	lastReportTime := time.Now()
	var lastReportBytes int64

	reportProgress := func(force bool) {
		now := time.Now()
		if !force && now.Sub(lastReportTime) < 250*time.Millisecond {
			return
		}

		currentDone := atomic.LoadInt64(&completedSegments)
		currentBytes := atomic.LoadInt64(&downloadedBytes)

		pct := (float64(currentDone) / float64(totalSegments)) * 100.0
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

		// Estimated total size
		var totStr string
		if currentDone > 0 {
			avgChunkSize := float64(currentBytes) / float64(currentDone)
			estTotal := int64(avgChunkSize * float64(totalSegments))
			totStr = fmt.Sprintf("~%s", formatBytes(estTotal))
		}

		statusMsg := fmt.Sprintf("Downloading chunks (%d/%d)...", currentDone, totalSegments)

		m.mu.Lock()
		for i, item := range m.downloads {
			if item.ID == id {
				if m.downloads[i].Status == "downloading" {
					m.downloads[i].Progress = pct
					m.downloads[i].Speed = speedStr
					m.downloads[i].DownloadedSize = dlStr
					m.downloads[i].TotalSize = totStr
					m.downloads[i].StatusMsg = statusMsg
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
				"statusMsg":  statusMsg,
			})
		}

		lastReportTime = now
		lastReportBytes = currentBytes
	}

	// Download Init Segments if present (fMP4 / CMAF)
	var videoInitName string
	if videoPL.InitSegment != "" {
		ext := getSegmentExt(videoPL.InitSegment)
		if ext == ".ts" {
			ext = ".mp4"
		}
		videoInitName = "init" + ext
		initPath := filepath.Join(tempDir, "video", videoInitName)
		log.Printf("[HLS %s] Downloading video init segment: %s -> %s", id, videoPL.InitSegment, initPath)
		if _, dlErr := downloadSegmentToFile(ctx, videoPL.InitSegment, initPath); dlErr != nil {
			log.Printf("[HLS %s] Warning: failed to download video init segment: %v", id, dlErr)
			videoInitName = ""
		}
	}

	var audioInitName string
	if audioPL != nil && audioPL.InitSegment != "" {
		ext := getSegmentExt(audioPL.InitSegment)
		if ext == ".ts" {
			ext = ".mp4"
		}
		audioInitName = "init" + ext
		initPath := filepath.Join(tempDir, "audio", audioInitName)
		log.Printf("[HLS %s] Downloading audio init segment: %s -> %s", id, audioPL.InitSegment, initPath)
		if _, dlErr := downloadSegmentToFile(ctx, audioPL.InitSegment, initPath); dlErr != nil {
			log.Printf("[HLS %s] Warning: failed to download audio init segment: %v", id, dlErr)
			audioInitName = ""
		}
	}

	videoFilenames := make([]string, len(videoPL.Segments))
	for i, sUrl := range videoPL.Segments {
		videoFilenames[i] = fmt.Sprintf("seg_%06d%s", i, getSegmentExt(sUrl))
	}

	var audioFilenames []string
	if audioPL != nil {
		audioFilenames = make([]string, len(audioPL.Segments))
		for i, sUrl := range audioPL.Segments {
			audioFilenames[i] = fmt.Sprintf("seg_%06d%s", i, getSegmentExt(sUrl))
		}
	}

	downloadSegmentList := func(segments []string, filenames []string, subFolder string) error {
		type job struct {
			index    int
			url      string
			filename string
		}

		jobs := make(chan job, len(segments))
		for idx, sUrl := range segments {
			jobs <- job{index: idx, url: sUrl, filename: filenames[idx]}
		}
		close(jobs)

		concurrency := 10
		if len(segments) < concurrency {
			concurrency = len(segments)
		}

		var wg sync.WaitGroup
		var firstErr error
		var errOnce sync.Once

		for w := 0; w < concurrency; w++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				for j := range jobs {
					select {
					case <-ctx.Done():
						return
					default:
					}

					segPath := filepath.Join(tempDir, subFolder, j.filename)
					if fi, err := os.Stat(segPath); err == nil && fi.Size() > 0 {
						atomic.AddInt64(&downloadedBytes, fi.Size())
						atomic.AddInt64(&completedSegments, 1)
						reportProgress(false)
						continue
					}

					var segBytes int64
					var dlErr error
					for attempt := 0; attempt < 20; attempt++ {
						select {
						case <-ctx.Done():
							return
						default:
						}

						segBytes, dlErr = downloadSegmentToFile(ctx, j.url, segPath)
						if dlErr == nil {
							break
						}

						if strings.Contains(dlErr.Error(), "rate limited") || strings.Contains(dlErr.Error(), "429") {
							time.Sleep(time.Duration(2000+attempt*1000) * time.Millisecond)
						} else {
							time.Sleep(time.Duration(500*(attempt+1)) * time.Millisecond)
						}
					}

					if dlErr != nil {
						errOnce.Do(func() {
							firstErr = fmt.Errorf("failed to download %s segment %d: %w", subFolder, j.index, dlErr)
						})
						return
					}

					atomic.AddInt64(&downloadedBytes, segBytes)
					atomic.AddInt64(&completedSegments, 1)
					reportProgress(false)
				}
			}()
		}

		wg.Wait()
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return firstErr
	}

	// Download Video Segments
	if err := downloadSegmentList(videoPL.Segments, videoFilenames, "video"); err != nil {
		return err
	}

	// Download Audio Segments if any
	if audioPL != nil {
		if err := downloadSegmentList(audioPL.Segments, audioFilenames, "audio"); err != nil {
			return err
		}
	}

	if ctx.Err() != nil {
		return ctx.Err()
	}

	// Update status to Merging
	m.mu.Lock()
	for i, item := range m.downloads {
		if item.ID == id {
			m.downloads[i].StatusMsg = "Merging video & audio..."
			m.downloads[i].Speed = ""
			if m.wailsApp != nil {
				m.wailsApp.Event.Emit("download_updated", m.downloads[i])
			}
			break
		}
	}
	m.mu.Unlock()

	// Build local M3U8 playlists preserving original PTS timestamps, duration, and discontinuity tags
	videoM3U8Content := buildLocalM3U8(vContent, "video", videoFilenames, videoInitName)
	videoM3U8Path := filepath.Join(tempDir, "local_video.m3u8")
	if err := os.WriteFile(videoM3U8Path, []byte(videoM3U8Content), 0644); err != nil {
		return fmt.Errorf("failed to write local video playlist: %w", err)
	}

	var audioM3U8Path string
	if audioPL != nil {
		audioM3U8Content := buildLocalM3U8(aContent, "audio", audioFilenames, audioInitName)
		audioM3U8Path = filepath.Join(tempDir, "local_audio.m3u8")
		if err := os.WriteFile(audioM3U8Path, []byte(audioM3U8Content), 0644); err != nil {
			return fmt.Errorf("failed to write local audio playlist: %w", err)
		}
	}

	// Check if ffmpeg is available
	ffmpegPath, err := exec.LookPath("ffmpeg")
	if err == nil && ffmpegPath != "" {
		var muxSuccess bool

		// Muxing Strategy 1: Local M3U8 with stream copy (preserves PTS/DTS and discontinuity timestamps)
		if audioM3U8Path != "" {
			cmd := exec.Command(ffmpegPath, "-y",
				"-allowed_extensions", "ALL",
				"-i", videoM3U8Path,
				"-allowed_extensions", "ALL",
				"-i", audioM3U8Path,
				"-map", "0:v:0",
				"-map", "1:a:0",
				"-c", "copy",
				"-bsf:a", "aac_adtstoasc",
				"-movflags", "+faststart",
				"-avoid_negative_ts", "make_zero",
				dest)
			log.Printf("[HLS %s] Running ffmpeg M3U8 copy mux: %v", id, cmd.Args)
			out, runErr := cmd.CombinedOutput()
			if runErr == nil {
				muxSuccess = true
			} else {
				log.Printf("[HLS %s] ffmpeg M3U8 copy mux failed: %s (%v), attempting audio resync remux...", id, string(out), runErr)
				// Strategy 2: Audio resync remux (-af aresample=async=1)
				cmdSync := exec.Command(ffmpegPath, "-y",
					"-allowed_extensions", "ALL",
					"-i", videoM3U8Path,
					"-allowed_extensions", "ALL",
					"-i", audioM3U8Path,
					"-map", "0:v:0",
					"-map", "1:a:0",
					"-c:v", "copy",
					"-c:a", "aac",
					"-af", "aresample=async=1",
					"-movflags", "+faststart",
					"-avoid_negative_ts", "make_zero",
					dest)
				outSync, runErrSync := cmdSync.CombinedOutput()
				if runErrSync == nil {
					muxSuccess = true
				} else {
					log.Printf("[HLS %s] ffmpeg M3U8 audio resync mux failed: %s (%v)", id, string(outSync), runErrSync)
				}
			}
		} else {
			cmd := exec.Command(ffmpegPath, "-y",
				"-allowed_extensions", "ALL",
				"-i", videoM3U8Path,
				"-c", "copy",
				"-bsf:a", "aac_adtstoasc",
				"-movflags", "+faststart",
				"-avoid_negative_ts", "make_zero",
				dest)
			log.Printf("[HLS %s] Running ffmpeg single M3U8 copy mux: %v", id, cmd.Args)
			out, runErr := cmd.CombinedOutput()
			if runErr == nil {
				muxSuccess = true
			} else {
				log.Printf("[HLS %s] ffmpeg single M3U8 copy mux failed: %s (%v), attempting copy without bsf...", id, string(out), runErr)
				cmdNoBsf := exec.Command(ffmpegPath, "-y",
					"-allowed_extensions", "ALL",
					"-i", videoM3U8Path,
					"-c", "copy",
					"-movflags", "+faststart",
					"-avoid_negative_ts", "make_zero",
					dest)
				outNoBsf, runErrNoBsf := cmdNoBsf.CombinedOutput()
				if runErrNoBsf == nil {
					muxSuccess = true
				} else {
					log.Printf("[HLS %s] ffmpeg single M3U8 without bsf failed: %s (%v), attempting audio resync remux...", id, string(outNoBsf), runErrNoBsf)
					cmdSync := exec.Command(ffmpegPath, "-y",
						"-allowed_extensions", "ALL",
						"-i", videoM3U8Path,
						"-c:v", "copy",
						"-c:a", "aac",
						"-af", "aresample=async=1",
						"-movflags", "+faststart",
						"-avoid_negative_ts", "make_zero",
						dest)
					outSync, runErrSync := cmdSync.CombinedOutput()
					if runErrSync == nil {
						muxSuccess = true
					} else {
						log.Printf("[HLS %s] ffmpeg single M3U8 audio resync failed: %s (%v)", id, string(outSync), runErrSync)
					}
				}
			}
		}

		// Fallback: If M3U8 muxing strategies failed, try concat demuxer as safety net
		if !muxSuccess {
			log.Printf("[HLS %s] Attempting fallback concat demuxer mux...", id)
			videoConcatFile := filepath.Join(tempDir, "video_concat.txt")
			_ = writeConcatFile(tempDir, "video", videoFilenames, videoConcatFile)
			var audioConcatFile string
			if audioPL != nil {
				audioConcatFile = filepath.Join(tempDir, "audio_concat.txt")
				_ = writeConcatFile(tempDir, "audio", audioFilenames, audioConcatFile)
			}

			var fallbackCmd *exec.Cmd
			if audioConcatFile != "" {
				fallbackCmd = exec.Command(ffmpegPath, "-y",
					"-f", "concat", "-safe", "0", "-i", videoConcatFile,
					"-f", "concat", "-safe", "0", "-i", audioConcatFile,
					"-map", "0:v:0",
					"-map", "1:a:0",
					"-c", "copy",
					"-bsf:a", "aac_adtstoasc",
					"-movflags", "+faststart",
					dest)
			} else {
				fallbackCmd = exec.Command(ffmpegPath, "-y",
					"-f", "concat", "-safe", "0", "-i", videoConcatFile,
					"-c", "copy",
					"-movflags", "+faststart",
					dest)
			}
			outFallback, runErrFallback := fallbackCmd.CombinedOutput()
			if runErrFallback == nil {
				muxSuccess = true
			} else {
				log.Printf("[HLS %s] Fallback concat demuxer failed: %s (%v), attempting single-pass direct concat fallback...", id, string(outFallback), runErrFallback)
				if errConcat := concatSegmentsDirect(tempDir, "video", videoFilenames, dest); errConcat != nil {
					return fmt.Errorf("ffmpeg error: %s (%w), direct concat error: %v", string(outFallback), runErrFallback, errConcat)
				}
				muxSuccess = true
			}
		}

		if muxSuccess {
			log.Printf("[HLS %s] Successfully finalized video into %s", id, dest)
		}
	} else {
		// No ffmpeg: direct single-pass concatenation into destination
		if errConcat := concatSegmentsDirect(tempDir, "video", videoFilenames, dest); errConcat != nil {
			return fmt.Errorf("failed to concatenate video segments: %w", errConcat)
		}
	}

	return nil
}

func getSegmentExt(segURL string) string {
	if u, err := url.Parse(segURL); err == nil {
		ext := strings.ToLower(filepath.Ext(u.Path))
		if ext == ".m4s" || ext == ".mp4" || ext == ".aac" || ext == ".ts" || ext == ".webm" || ext == ".m4a" {
			return ext
		}
	}
	return ".ts"
}

func buildLocalM3U8(rawContent string, subFolder string, segmentFilenames []string, initFilename string) string {
	lines := strings.Split(rawContent, "\n")
	var result []string
	segIdx := 0
	hasEndList := false

	reInitMap := regexp.MustCompile(`URI="([^"]+)"`)

	for _, rawLine := range lines {
		line := strings.TrimSpace(rawLine)
		if line == "" {
			continue
		}

		if strings.HasPrefix(line, "#EXT-X-MAP:") {
			if initFilename != "" {
				replaced := reInitMap.ReplaceAllString(line, fmt.Sprintf(`URI="%s/%s"`, subFolder, initFilename))
				result = append(result, replaced)
			} else {
				result = append(result, line)
			}
		} else if strings.HasPrefix(line, "#") {
			if strings.HasPrefix(line, "#EXT-X-ENDLIST") {
				hasEndList = true
			}
			result = append(result, line)
		} else {
			// Segment URI line
			if segIdx < len(segmentFilenames) {
				localPath := fmt.Sprintf("%s/%s", subFolder, segmentFilenames[segIdx])
				result = append(result, localPath)
				segIdx++
			} else {
				result = append(result, line)
			}
		}
	}

	if !hasEndList {
		result = append(result, "#EXT-X-ENDLIST")
	}

	// Fallback if segment count in raw content didn't match
	if segIdx != len(segmentFilenames) && len(segmentFilenames) > 0 {
		var sb strings.Builder
		sb.WriteString("#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:VOD\n")
		if initFilename != "" {
			sb.WriteString(fmt.Sprintf("#EXT-X-MAP:URI=\"%s/%s\"\n", subFolder, initFilename))
		}
		for _, fn := range segmentFilenames {
			sb.WriteString("#EXTINF:4.0,\n")
			sb.WriteString(fmt.Sprintf("%s/%s\n", subFolder, fn))
		}
		sb.WriteString("#EXT-X-ENDLIST\n")
		return sb.String()
	}

	return strings.Join(result, "\n") + "\n"
}

func writeConcatFile(tempDir, subFolder string, filenames []string, listPath string) error {
	f, err := os.Create(listPath)
	if err != nil {
		return err
	}
	defer f.Close()
	for _, fn := range filenames {
		segPath := filepath.Join(tempDir, subFolder, fn)
		absPath, _ := filepath.Abs(segPath)
		escaped := strings.ReplaceAll(absPath, "'", "'\\''")
		if _, err := f.WriteString(fmt.Sprintf("file '%s'\n", escaped)); err != nil {
			return err
		}
	}
	return nil
}

func downloadSegmentToFile(ctx context.Context, segURL, outPath string) (int64, error) {
	reqCtx, cancel := context.WithTimeout(ctx, 35*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, "GET", segURL, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "*/*")
	if parsedUrl, err := url.Parse(segURL); err == nil {
		origin := fmt.Sprintf("%s://%s", parsedUrl.Scheme, parsedUrl.Host)
		req.Header.Set("Referer", origin+"/")
		req.Header.Set("Origin", origin)
	}

	resp, err := defaultClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode == http.StatusServiceUnavailable {
		return 0, fmt.Errorf("rate limited: %s", resp.Status)
	}
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusPartialContent {
		return 0, fmt.Errorf("bad status %s", resp.Status)
	}

	partPath := outPath + ".tmp"
	f, err := os.Create(partPath)
	if err != nil {
		return 0, err
	}

	buf := make([]byte, 256*1024)
	n, err := io.CopyBuffer(f, resp.Body, buf)
	f.Close()
	if err != nil {
		_ = os.Remove(partPath)
		return 0, err
	}

	if err := os.Rename(partPath, outPath); err != nil {
		return 0, err
	}

	return n, nil
}

func concatSegmentsDirect(tempDir, subFolder string, filenames []string, outputPath string) error {
	out, err := os.Create(outputPath)
	if err != nil {
		return err
	}
	defer out.Close()

	buf := make([]byte, 512*1024)
	for _, fn := range filenames {
		segPath := filepath.Join(tempDir, subFolder, fn)
		in, err := os.Open(segPath)
		if err != nil {
			return err
		}
		_, copyErr := io.CopyBuffer(out, in, buf)
		in.Close()
		if copyErr != nil {
			return copyErr
		}
	}
	return nil
}
