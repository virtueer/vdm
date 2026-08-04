package main

import (
	"encoding/json"
	"fmt"
	"net/http"
)

type DownloadRequest struct {
	URL     string `json:"url"`
	Type    string `json:"type"`
	Size    string `json:"size"`
	PageURL string `json:"pageUrl"`
}

type Server struct {
	app *App
}

func NewServer(app *App) *Server {
	return &Server{app: app}
}

func (s *Server) Start() {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/download", func(w http.ResponseWriter, r *http.Request) {
		// Handle CORS
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

		// Pass to download manager via app
		if s.app != nil {
			s.app.AddDownload(req.URL, req.Type, req.Size, req.PageURL)
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "success"})
	})

	mux.HandleFunc("/api/status", func(w http.ResponseWriter, r *http.Request) {
		// Handle CORS
		w.Header().Set("Access-Control-Allow-Origin", "*")

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "running"})
	})

	go func() {
		fmt.Println("Starting HTTP server on :9614")
		if err := http.ListenAndServe(":9614", mux); err != nil {
			fmt.Printf("HTTP server error: %v\n", err)
		}
	}()
}
