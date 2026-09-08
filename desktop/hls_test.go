package main

import (
	"net/url"
	"strings"
	"testing"
)

func TestGetSegmentExt(t *testing.T) {
	tests := []struct {
		url      string
		expected string
	}{
		{"https://example.com/seg0.ts?token=123", ".ts"},
		{"https://example.com/seg0.m4s", ".m4s"},
		{"https://example.com/seg0.mp4?v=1", ".mp4"},
		{"https://example.com/audio.aac", ".aac"},
		{"https://example.com/stream.webm", ".webm"},
		{"https://example.com/chunk_100", ".ts"},
	}

	for _, tt := range tests {
		got := getSegmentExt(tt.url)
		if got != tt.expected {
			t.Errorf("getSegmentExt(%q) = %q; want %q", tt.url, got, tt.expected)
		}
	}
}

func TestBuildLocalM3U8_Standard(t *testing.T) {
	raw := `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:6.000,
https://example.com/seg0.ts
#EXTINF:5.800,
https://example.com/seg1.ts
#EXT-X-DISCONTINUITY
#EXTINF:6.000,
https://example.com/seg2.ts
#EXT-X-ENDLIST`

	filenames := []string{"seg_000000.ts", "seg_000001.ts", "seg_000002.ts"}
	result := buildLocalM3U8(raw, "video", filenames, "")

	if !strings.Contains(result, "video/seg_000000.ts") {
		t.Errorf("Expected result to contain video/seg_000000.ts, got:\n%s", result)
	}
	if !strings.Contains(result, "video/seg_000001.ts") {
		t.Errorf("Expected result to contain video/seg_000001.ts, got:\n%s", result)
	}
	if !strings.Contains(result, "video/seg_000002.ts") {
		t.Errorf("Expected result to contain video/seg_000002.ts, got:\n%s", result)
	}
	if !strings.Contains(result, "#EXT-X-DISCONTINUITY") {
		t.Errorf("Expected result to preserve #EXT-X-DISCONTINUITY tag, got:\n%s", result)
	}
	if !strings.Contains(result, "#EXTINF:5.800,") {
		t.Errorf("Expected result to preserve exact #EXTINF duration, got:\n%s", result)
	}
}

func TestBuildLocalM3U8_WithInitSegment(t *testing.T) {
	raw := `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-TARGETDURATION:4
#EXT-X-MAP:URI="init.mp4"
#EXTINF:4.000,
https://example.com/seg0.m4s
#EXTINF:4.000,
https://example.com/seg1.m4s
#EXT-X-ENDLIST`

	filenames := []string{"seg_000000.m4s", "seg_000001.m4s"}
	result := buildLocalM3U8(raw, "video", filenames, "init.mp4")

	if !strings.Contains(result, `#EXT-X-MAP:URI="video/init.mp4"`) {
		t.Errorf("Expected result to contain rewritten MAP URI, got:\n%s", result)
	}
	if !strings.Contains(result, "video/seg_000000.m4s") {
		t.Errorf("Expected result to contain video/seg_000000.m4s, got:\n%s", result)
	}
}

func TestParseHLS_MasterPlaylist(t *testing.T) {
	masterContent := `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio-aac",NAME="Turkish",DEFAULT=YES,URI="audio/tr.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,AUDIO="audio-aac"
1080p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720,AUDIO="audio-aac"
720p/index.m3u8`

	baseURL, _ := url.Parse("https://cdn.example.com/vod/master.m3u8")
	pl, err := parseHLS(masterContent, baseURL)
	if err != nil {
		t.Fatalf("parseHLS failed: %v", err)
	}

	if !pl.IsMaster {
		t.Errorf("Expected master playlist to be true")
	}
	if len(pl.Variants) != 2 {
		t.Fatalf("Expected 2 variants, got %d", len(pl.Variants))
	}
	if pl.Variants[0].Width != 1920 || pl.Variants[0].Height != 1080 {
		t.Errorf("Expected 1920x1080 variant, got %dx%d", pl.Variants[0].Width, pl.Variants[0].Height)
	}
	if len(pl.AudioTracks) != 1 {
		t.Fatalf("Expected 1 audio track, got %d", len(pl.AudioTracks))
	}
	if pl.AudioTracks[0].URI != "https://cdn.example.com/vod/audio/tr.m3u8" {
		t.Errorf("Expected resolved audio URI, got %s", pl.AudioTracks[0].URI)
	}
}
