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

	setCors := func(w http.ResponseWriter) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	}

	mux.HandleFunc("/api/downloads", func(w http.ResponseWriter, r *http.Request) {
		setCors(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		list := s.manager.GetDownloads()
		json.NewEncoder(w).Encode(list)
	})

	mux.HandleFunc("/api/scan", func(w http.ResponseWriter, r *http.Request) {
		setCors(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		list := s.manager.ScanExistingDownloads()
		json.NewEncoder(w).Encode(list)
	})

	mux.HandleFunc("/api/download", func(w http.ResponseWriter, r *http.Request) {
		setCors(w)
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

	mux.HandleFunc("/api/pause", func(w http.ResponseWriter, r *http.Request) {
		setCors(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		var payload struct {
			ID string `json:"id"`
		}
		_ = json.NewDecoder(r.Body).Decode(&payload)
		id := payload.ID
		if id == "" {
			id = r.URL.Query().Get("id")
		}
		if id != "" {
			s.manager.PauseDownload(id)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	mux.HandleFunc("/api/resume", func(w http.ResponseWriter, r *http.Request) {
		setCors(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		var payload struct {
			ID string `json:"id"`
		}
		_ = json.NewDecoder(r.Body).Decode(&payload)
		id := payload.ID
		if id == "" {
			id = r.URL.Query().Get("id")
		}
		if id != "" {
			s.manager.ResumeDownload(id)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	mux.HandleFunc("/api/delete", func(w http.ResponseWriter, r *http.Request) {
		setCors(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		var payload struct {
			ID         string `json:"id"`
			DeleteFile bool   `json:"deleteFile"`
		}
		_ = json.NewDecoder(r.Body).Decode(&payload)
		id := payload.ID
		if id == "" {
			id = r.URL.Query().Get("id")
		}
		delFile := payload.DeleteFile
		if r.URL.Query().Get("deleteFile") == "true" || r.URL.Query().Get("deleteFile") == "1" {
			delFile = true
		}
		if id != "" {
			s.manager.RemoveDownload(id, delFile)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	mux.HandleFunc("/api/mediainfo", func(w http.ResponseWriter, r *http.Request) {
		setCors(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		target := r.URL.Query().Get("target")
		if target == "" {
			http.Error(w, "target is required", http.StatusBadRequest)
			return
		}
		info, err := s.manager.GetMediaInfo(target)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(info)
	})

	mux.HandleFunc("/api/show", func(w http.ResponseWriter, r *http.Request) {
		setCors(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		id := r.URL.Query().Get("id")
		if id != "" {
			s.manager.ShowInFolder(id)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	go func() {
		fmt.Println("VDM extension listener running on :9614")
		http.ListenAndServe(":9614", mux)
	}()
}
