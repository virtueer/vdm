package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

type ffprobeOutput struct {
	Streams []struct {
		Index         int               `json:"index"`
		CodecName     string            `json:"codec_name"`
		CodecLongName string            `json:"codec_long_name"`
		CodecType     string            `json:"codec_type"`
		Width         int               `json:"width"`
		Height        int               `json:"height"`
		DisplayAspect string            `json:"display_aspect_ratio"`
		RFrameRate    string            `json:"r_frame_rate"`
		BitRate       string            `json:"bit_rate"`
		Channels      int               `json:"channels"`
		ChannelLayout string            `json:"channel_layout"`
		SampleRate    string            `json:"sample_rate"`
		Tags          map[string]string `json:"tags"`
	} `json:"streams"`
	Format struct {
		FormatName     string `json:"format_name"`
		FormatLongName string `json:"format_long_name"`
		Duration       string `json:"duration"`
		Size           string `json:"size"`
		BitRate        string `json:"bit_rate"`
	} `json:"format"`
}

func (m *Manager) GetMediaInfo(target string) (*MediaInfo, error) {
	filePath := target

	// If target is a download ID, look up its destination file
	m.mu.Lock()
	for _, item := range m.downloads {
		if item.ID == target {
			if item.Destination != "" {
				filePath = item.Destination
			}
			break
		}
	}
	m.mu.Unlock()

	fi, err := os.Stat(filePath)
	if err != nil {
		return nil, fmt.Errorf("dosya bulunamadı: %w", err)
	}

	cmd := exec.Command("ffprobe",
		"-v", "error",
		"-show_entries", "format=duration,size,bit_rate,format_name,format_long_name:stream=index,codec_name,codec_long_name,codec_type,width,height,display_aspect_ratio,r_frame_rate,bit_rate,channels,channel_layout,sample_rate,tags",
		"-of", "json",
		filePath)

	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("ffprobe analizi başarısız: %s (%w)", string(out), err)
	}

	var raw ffprobeOutput
	if err := json.Unmarshal(out, &raw); err != nil {
		return nil, fmt.Errorf("metadata okunamadı: %w", err)
	}

	info := &MediaInfo{
		FilePath:        filePath,
		FileName:        filepath.Base(filePath),
		SizeBytes:       fi.Size(),
		FileSize:        formatBytes(fi.Size()),
		FormatName:      raw.Format.FormatLongName,
		VideoStreams:    []StreamInfo{},
		AudioStreams:    []StreamInfo{},
		SubtitleStreams: []StreamInfo{},
	}
	if info.FormatName == "" {
		info.FormatName = raw.Format.FormatName
	}

	if raw.Format.Duration != "" {
		if dSecs, err := strconv.ParseFloat(raw.Format.Duration, 64); err == nil {
			info.DurationSecs = dSecs
			info.Duration = formatDurationSecs(int64(dSecs))
		}
	}

	if raw.Format.BitRate != "" {
		if br, err := strconv.ParseInt(raw.Format.BitRate, 10, 64); err == nil {
			info.OverallBitrate = formatBitrate(br)
		}
	}

	for _, s := range raw.Streams {
		st := StreamInfo{
			Index:     s.Index,
			CodecType: s.CodecType,
			CodecName: strings.ToUpper(s.CodecName),
			CodecLong: s.CodecLongName,
		}

		if s.Tags != nil {
			if l, ok := s.Tags["language"]; ok {
				st.Language = l
			}
			if t, ok := s.Tags["title"]; ok {
				st.Title = t
			}
		}

		if s.BitRate != "" {
			if br, err := strconv.ParseInt(s.BitRate, 10, 64); err == nil {
				st.Bitrate = formatBitrate(br)
			}
		}

		switch s.CodecType {
		case "video":
			st.Width = s.Width
			st.Height = s.Height
			qualityLabel := ""
			if s.Height >= 2160 {
				qualityLabel = " (4K UHD)"
			} else if s.Height >= 1080 {
				qualityLabel = " (1080p Full HD)"
			} else if s.Height >= 720 {
				qualityLabel = " (720p HD)"
			} else if s.Height >= 480 {
				qualityLabel = " (480p SD)"
			}
			st.Resolution = fmt.Sprintf("%dx%d%s", s.Width, s.Height, qualityLabel)
			st.AspectRatio = s.DisplayAspect

			if s.RFrameRate != "" && s.RFrameRate != "0/0" {
				parts := strings.Split(s.RFrameRate, "/")
				if len(parts) == 2 {
					num, _ := strconv.ParseFloat(parts[0], 64)
					den, _ := strconv.ParseFloat(parts[1], 64)
					if den > 0 {
						st.FPS = fmt.Sprintf("%.2f fps", num/den)
						st.FPS = strings.TrimSuffix(st.FPS, ".00 fps") + " fps"
					}
				}
			}

			info.VideoStreams = append(info.VideoStreams, st)

		case "audio":
			st.Channels = s.Channels
			st.ChannelLay = s.ChannelLayout
			if s.SampleRate != "" {
				if sr, err := strconv.Atoi(s.SampleRate); err == nil {
					st.SampleRate = fmt.Sprintf("%.1f kHz", float64(sr)/1000.0)
				}
			}
			info.AudioStreams = append(info.AudioStreams, st)

		case "subtitle":
			info.SubtitleStreams = append(info.SubtitleStreams, st)
		}
	}

	return info, nil
}
