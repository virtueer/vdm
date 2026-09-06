package main

type DownloadItem struct {
	ID             string  `json:"id"`
	URL            string  `json:"url"`
	Title          string  `json:"title"`
	Destination    string  `json:"destination"`
	Status         string  `json:"status"` // "pending", "downloading", "paused", "completed", "error", "cancelled"
	StatusMsg      string  `json:"statusMsg"`
	ErrorDetails   string  `json:"errorDetails,omitempty"`
	Progress       float64 `json:"progress"`
	Speed          string  `json:"speed"`
	DownloadedSize string  `json:"downloadedSize"`
	TotalSize      string  `json:"totalSize"`
	ElapsedSecs    int64   `json:"elapsedSecs"`
	StartedAt      int64   `json:"startedAt"`
	CreatedAt      int64   `json:"createdAt"`
}

type StreamInfo struct {
	Index       int    `json:"index"`
	CodecType   string `json:"codecType"` // "video", "audio", "subtitle"
	CodecName   string `json:"codecName"`
	CodecLong   string `json:"codecLong"`
	Resolution  string `json:"resolution,omitempty"`
	Width       int    `json:"width,omitempty"`
	Height      int    `json:"height,omitempty"`
	AspectRatio string `json:"aspectRatio,omitempty"`
	FPS         string `json:"fps,omitempty"`
	Bitrate     string `json:"bitrate,omitempty"`
	Channels    int    `json:"channels,omitempty"`
	ChannelLay  string `json:"channelLayout,omitempty"`
	SampleRate  string `json:"sampleRate,omitempty"`
	Language    string `json:"language,omitempty"`
	Title       string `json:"title,omitempty"`
}

type MediaInfo struct {
	FilePath        string       `json:"filePath"`
	FileName        string       `json:"fileName"`
	FileSize        string       `json:"fileSize"`
	SizeBytes       int64        `json:"sizeBytes"`
	Duration        string       `json:"duration"`
	DurationSecs    float64      `json:"durationSecs"`
	FormatName      string       `json:"formatName"`
	OverallBitrate  string       `json:"overallBitrate"`
	VideoStreams    []StreamInfo `json:"videoStreams"`
	AudioStreams    []StreamInfo `json:"audioStreams"`
	SubtitleStreams []StreamInfo `json:"subtitleStreams"`
}
