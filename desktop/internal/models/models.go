package models

type DownloadItem struct {
	ID             string  `json:"id"`
	URL            string  `json:"url"`
	Type           string  `json:"type"`
	Size           string  `json:"size"`
	Status         string  `json:"status"` // "pending", "downloading", "paused", "completed", "error", "cancelled"
	PageURL        string  `json:"pageUrl"`
	Destination    string  `json:"destination"`
	Title          string  `json:"title"`
	FormatID       string  `json:"formatId"`
	StatusMsg      string  `json:"statusMsg"`
	Progress       float64 `json:"progress"`
	Speed          string  `json:"speed"`
	DownloadedSize string  `json:"downloadedSize"`
	TotalSize      string  `json:"totalSize"`
	CreatedAt      int64   `json:"createdAt"`
	StartedAt      int64   `json:"startedAt"`
	ElapsedSecs    int64   `json:"elapsedSecs"`
}

type YouTubeFormat struct {
	FormatID   string  `json:"formatId"`
	Ext        string  `json:"ext"`
	Resolution string  `json:"resolution"`
	FPS        float64 `json:"fps"`
	Filesize   int64   `json:"filesize"`
	TBR        float64 `json:"tbr"`
	VCodec     string  `json:"vcodec"`
	ACodec     string  `json:"acodec"`
	FormatNote string  `json:"formatNote"`
	Format     string  `json:"format"`
}

type RawYtdlpFormat struct {
	FormatID       string   `json:"format_id"`
	Ext            string   `json:"ext"`
	Resolution     string   `json:"resolution"`
	FPS            *float64 `json:"fps"`
	Filesize       *int64   `json:"filesize"`
	FilesizeApprox *int64   `json:"filesize_approx"`
	TBR            *float64 `json:"tbr"`
	VCodec         string   `json:"vcodec"`
	ACodec         string   `json:"acodec"`
	FormatNote     string   `json:"format_note"`
	Format         string   `json:"format"`
}

type RawYtdlpInfo struct {
	Formats []RawYtdlpFormat `json:"formats"`
}
