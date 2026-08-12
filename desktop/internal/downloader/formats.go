package downloader

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os/exec"
	"vdm/internal/config"
	"vdm/internal/models"
)

func GetYouTubeFormats(u string, logFn func(string, ...interface{})) ([]models.YouTubeFormat, error) {
	ytdlpPath := config.GetDependencyPath("yt-dlp")
	if logFn != nil {
		logFn("Fetching YouTube formats for: %s\n", u)
	}
	args := []string{
		"--dump-single-json",
		"--no-playlist",
		"--js-runtimes", "node",
		"--extractor-args", "youtube:player_client=android,web",
		"--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
		u,
	}
	cmd := exec.Command(ytdlpPath, args...)
	var out bytes.Buffer
	var errOut bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errOut

	if err := cmd.Run(); err != nil {
		if logFn != nil {
			logFn("GetYouTubeFormats error: %v, stderr: %s\n", err, errOut.String())
		}
		return nil, fmt.Errorf("yt-dlp failed: %w", err)
	}

	var info models.RawYtdlpInfo
	if err := json.Unmarshal(out.Bytes(), &info); err != nil {
		if logFn != nil {
			logFn("GetYouTubeFormats JSON parse error: %v\n", err)
		}
		return nil, fmt.Errorf("failed to parse yt-dlp json: %w", err)
	}

	var formats []models.YouTubeFormat
	for _, f := range info.Formats {
		size := int64(0)
		if f.Filesize != nil && *f.Filesize > 0 {
			size = *f.Filesize
		} else if f.FilesizeApprox != nil && *f.FilesizeApprox > 0 {
			size = *f.FilesizeApprox
		}

		fpsVal := float64(0)
		if f.FPS != nil {
			fpsVal = *f.FPS
		}

		tbrVal := float64(0)
		if f.TBR != nil {
			tbrVal = *f.TBR
		}

		res := f.Resolution
		if res == "" {
			if f.VCodec != "none" && f.VCodec != "" {
				res = "video"
			} else {
				res = "audio only"
			}
		}

		formats = append(formats, models.YouTubeFormat{
			FormatID:   f.FormatID,
			Ext:        f.Ext,
			Resolution: res,
			FPS:        fpsVal,
			Filesize:   size,
			TBR:        tbrVal,
			VCodec:     f.VCodec,
			ACodec:     f.ACodec,
			FormatNote: f.FormatNote,
			Format:     f.Format,
		})
	}
	if logFn != nil {
		logFn("Found %d formats for %s\n", len(formats), u)
	}
	return formats, nil
}
