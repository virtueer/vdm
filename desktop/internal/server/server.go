package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"vdm/internal/config"
	"vdm/internal/downloader"
)

type DownloadRequest struct {
	URL      string `json:"url"`
	Type     string `json:"type"`
	Size     string `json:"size"`
	PageURL  string `json:"pageUrl"`
	Title    string `json:"title"`
	FormatID string `json:"formatId"`
}

type Server struct {
	manager *downloader.Manager
}

func NewServer(manager *downloader.Manager) *Server {
	return &Server{manager: manager}
}

func (s *Server) Start() {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/download", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req DownloadRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		if s.manager != nil {
			s.manager.AddDownload(req.URL, req.Type, req.Size, req.PageURL, req.Title, req.FormatID)
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "success"})
	})

	mux.HandleFunc("/api/status", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "running"})
	})

	mux.HandleFunc("/api/config", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		if r.Method == http.MethodGet {
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(config.GlobalConfig)
			return
		}

		if r.Method == http.MethodPost {
			var cfg config.AppConfig
			if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			config.GlobalConfig = cfg
			config.SaveConfig()
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(map[string]string{"status": "saved"})
			return
		}

		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	})

	go func() {
		fmt.Println("Starting HTTP server on :9614")
		if err := http.ListenAndServe(":9614", mux); err != nil {
			fmt.Printf("HTTP server error: %v\n", err)
		}
	}()
}
