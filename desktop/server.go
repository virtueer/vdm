package main

import (
	"encoding/json"
	"fmt"
	"net/http"
)

type Server struct {
	manager *Manager
}

func NewServer(manager *Manager) *Server {
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

		var payload struct {
			URL     string `json:"url"`
			Title   string `json:"title"`
			PageURL string `json:"pageUrl"`
			Size    string `json:"size"`
			Type    string `json:"type"`
		}

		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}

		if payload.URL == "" {
			http.Error(w, "URL is required", http.StatusBadRequest)
			return
		}

		id := s.manager.AddDownload(payload.URL, payload.Title)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status": "ok",
			"id":     id,
		})
	})

	go func() {
		fmt.Println("VDM extension listener running on :9614")
		http.ListenAndServe(":9614", mux)
	}()
}
