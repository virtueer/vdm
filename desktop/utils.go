package main

import (
	"fmt"
	"net/url"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

func formatBytes(b int64) string {
	if b >= 1024*1024*1024 {
		return fmt.Sprintf("%.2f GB", float64(b)/(1024*1024*1024))
	}
	if b >= 1024*1024 {
		return fmt.Sprintf("%.2f MB", float64(b)/(1024*1024))
	}
	if b >= 1024 {
		return fmt.Sprintf("%.2f KB", float64(b)/1024)
	}
	return fmt.Sprintf("%d B", b)
}

func formatSpeed(bytesPerSec float64) string {
	if bytesPerSec >= 1024*1024 {
		return fmt.Sprintf("%.2f MB/s", bytesPerSec/(1024*1024))
	}
	if bytesPerSec >= 1024 {
		return fmt.Sprintf("%.2f KB/s", bytesPerSec/1024)
	}
	return fmt.Sprintf("%.0f B/s", bytesPerSec)
}

func formatBitrate(b int64) string {
	if b >= 1000*1000 {
		return fmt.Sprintf("%.2f Mbps", float64(b)/1000000.0)
	}
	if b >= 1000 {
		return fmt.Sprintf("%d kbps", b/1000)
	}
	return fmt.Sprintf("%d bps", b)
}

func formatDurationSecs(seconds int64) string {
	hrs := seconds / 3600
	mins := (seconds % 3600) / 60
	secs := seconds % 60
	if hrs > 0 {
		return fmt.Sprintf("%02d:%02d:%02d (%d sa %d dk)", hrs, mins, secs, hrs, mins)
	}
	return fmt.Sprintf("%02d:%02d (%d dk %d sn)", mins, secs, mins, secs)
}

func sanitizeFilename(name string) string {
	if name == "" {
		return ""
	}
	name = strings.ReplaceAll(name, "\n", " ")
	name = strings.ReplaceAll(name, "\r", " ")
	name = strings.ReplaceAll(name, "\t", " ")

	invalidChars := []string{"<", ">", ":", "\"", "/", "\\", "|", "?", "*"}
	for _, char := range invalidChars {
		name = strings.ReplaceAll(name, char, "_")
	}

	for strings.Contains(name, "  ") {
		name = strings.ReplaceAll(name, "  ", " ")
	}

	name = strings.TrimSpace(name)
	if len(name) > 100 {
		name = name[:100]
	}
	return strings.TrimSpace(name)
}

func extractFilenameFromURL(u string) string {
	parsed, err := url.Parse(u)
	if err == nil {
		path := parsed.Path
		parts := strings.Split(path, "/")
		var validParts []string
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if p != "" {
				validParts = append(validParts, p)
			}
		}

		genericNames := map[string]bool{
			"master.txt": true, "master.m3u8": true, "index.m3u8": true, "playlist.m3u8": true,
			"manifest.mpd": true, "sublist.txt": true, "sublist_2.txt": true, "sublist_aud1.txt": true,
			"sublist_aud2.txt": true, "playlist.txt": true, "chunklist.m3u8": true, "video.m3u8": true,
			"audio.m3u8": true, "stream.m3u8": true, "mono.m3u8": true, "master": true, "index": true,
			"video": true, "audio": true,
		}

		for i := len(validParts) - 1; i >= 0; i-- {
			part := validParts[i]
			lower := strings.ToLower(part)

			if genericNames[lower] || strings.HasPrefix(lower, "sublist") || strings.HasPrefix(lower, "chunk") ||
				lower == "hls" || lower == "vod" || lower == "videos" || lower == "api" {
				continue
			}

			if part != "" {
				ext := filepath.Ext(part)
				if ext == "" || ext == ".txt" || ext == ".m3u8" || ext == ".mpd" {
					part = strings.TrimSuffix(part, ext) + ".mp4"
				}
				return part
			}
		}

		if len(validParts) > 0 {
			last := validParts[len(validParts)-1]
			ext := filepath.Ext(last)
			if ext == "" || ext == ".txt" || ext == ".m3u8" {
				last = strings.TrimSuffix(last, ext) + ".mp4"
			}
			return last
		}
	}
	return fmt.Sprintf("download_%d.mp4", time.Now().Unix())
}

func cleanVideoTitle(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}

	// Remove extension
	ext := filepath.Ext(raw)
	if ext == ".mp4" || ext == ".mkv" || ext == ".avi" || ext == ".txt" || ext == ".m3u8" || ext == ".ts" || ext == ".webm" {
		raw = strings.TrimSuffix(raw, ext)
	}

	// 1. Remove website branding / suffixes
	siteRegexes := []*regexp.Regexp{
		regexp.MustCompile(`(?i)\s*[-–—|•/]\s*(dizipal|dizigom|filmmodu|fullhdfilmizlesene|hdfilmcehennemi|hdcehennemi|inat|sezonlukdizi|diziwatch|yabancidizi|filmevreni|youtube|vdm|netflix|disney\+?|prime\s*video|hbo\s*max|blutv|gain|exxen).*$`),
		regexp.MustCompile(`(?i)\s*(tek parça|full hd|1080p|720p|4k|uhd)?\s*(türkçe dublaj|türkçe altyazılı|altyazılı|dublaj)?\s*(izle|seyret)\s*.*$`),
	}
	for _, re := range siteRegexes {
		raw = re.ReplaceAllString(raw, "")
	}

	// 2. If it's a URL slug with hashes and release tags
	if strings.Contains(raw, "-") || strings.Contains(raw, "_") || (strings.Contains(raw, ".") && !strings.Contains(raw, " ")) {
		// Strip random alphanumeric hashes (e.g. -00RjrN8j8nt, -rx7ra4pfi8uxmp4, -tt13668894)
		reHashes := regexp.MustCompile(`(?i)[-_.](tt\d+|rx[a-z0-9]+|[0-9a-zA-Z]{8,}|[0-9a-f]{12,}|mp4|mkv)$`)
		for i := 0; i < 6; i++ {
			trimmed := reHashes.ReplaceAllString(raw, "")
			if trimmed == raw {
				break
			}
			raw = trimmed
		}

		// Strip release tags (webdl, web-dl, trdual, dual, bluray, x264, x265, 1080p, etc.)
		reReleaseTags := regexp.MustCompile(`(?i)[-_.](web-?dl|web-?rip|bluray|bdrip|hdrip|dvdrip|trdual|dual|x264|x265|hevc|aac|ac3|dts|remux|repack|proper|1080p|720p|480p|2160p|4k)`)
		for i := 0; i < 4; i++ {
			trimmed := reReleaseTags.ReplaceAllString(raw, "")
			if trimmed == raw {
				break
			}
			raw = trimmed
		}

		// Replace dashes and underscores with spaces
		raw = strings.ReplaceAll(raw, "-", " ")
		raw = strings.ReplaceAll(raw, "_", " ")

		// If words were separated by dots e.g. "Breaking.Bad.S05E14", replace dots not following numbers with spaces
		reDots := regexp.MustCompile(`([^0-9])\.|\.([^0-9\s])`)
		raw = reDots.ReplaceAllString(raw, "$1 $2")
		raw = strings.TrimSpace(raw)

		// Format season/episode like s01e01 -> S01E01
		reEp := regexp.MustCompile(`(?i)\b(s\d{1,2})\s*(e\d{1,2})\b`)
		raw = reEp.ReplaceAllStringFunc(raw, func(s string) string {
			s = strings.ReplaceAll(s, " ", "")
			return strings.ToUpper(s)
		})
	}

	// 3. Normalize whitespace
	reSpaces := regexp.MustCompile(`\s+`)
	raw = reSpaces.ReplaceAllString(raw, " ")
	raw = strings.TrimSpace(raw)

	return raw
}
