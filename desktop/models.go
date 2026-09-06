package main

type DownloadItem struct {
	ID             string  `json:"id"`
	URL            string  `json:"url"`
	Title          string  `json:"title"`
	Destination    string  `json:"destination"`
	Status         string  `json:"status"` // "pending", "downloading", "paused", "completed", "error", "cancelled"
	StatusMsg      string  `json:"statusMsg"`
	Progress       float64 `json:"progress"`
	Speed          string  `json:"speed"`
	DownloadedSize string  `json:"downloadedSize"`
	TotalSize      string  `json:"totalSize"`
	ElapsedSecs    int64   `json:"elapsedSecs"`
	StartedAt      int64   `json:"startedAt"`
	CreatedAt      int64   `json:"createdAt"`
}
