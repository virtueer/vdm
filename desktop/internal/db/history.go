package db

import (
	"log"
	"vdm/internal/models"
)

func (s *Store) LoadHistory() []models.DownloadItem {
	if s.db == nil {
		return nil
	}

	rows, err := s.db.Query(`
		SELECT id, url, type, size, status, pageUrl, destination, title, 
		       COALESCE(formatId, ''), COALESCE(statusMsg, ''),
		       COALESCE(progress, 0), COALESCE(speed, ''),
		       COALESCE(downloadedSize, ''), COALESCE(totalSize, ''),
		       COALESCE(createdAt, 0), COALESCE(startedAt, 0), COALESCE(elapsedSecs, 0)
		FROM downloads
	`)
	if err != nil {
		log.Printf("Error loading history from sqlite: %v\n", err)
		return nil
	}
	defer rows.Close()

	var items []models.DownloadItem
	for rows.Next() {
		var i models.DownloadItem
		err = rows.Scan(&i.ID, &i.URL, &i.Type, &i.Size, &i.Status, &i.PageURL, &i.Destination, &i.Title, &i.FormatID, &i.StatusMsg, &i.Progress, &i.Speed, &i.DownloadedSize, &i.TotalSize, &i.CreatedAt, &i.StartedAt, &i.ElapsedSecs)
		if err != nil {
			log.Printf("Error scanning row: %v\n", err)
			continue
		}

		switch i.Status {
		case "downloading", "pending":
			i.Status = "paused"
		case "completed":
			i.Progress = 100
			i.StatusMsg = "Completed"
		}

		items = append(items, i)
	}
	return items
}

func (s *Store) SaveHistory(items []models.DownloadItem) {
	if s.db == nil {
		return
	}

	tx, err := s.db.Begin()
	if err != nil {
		log.Printf("Error starting db transaction: %v\n", err)
		return
	}

	stmt, err := tx.Prepare(`
		INSERT INTO downloads (id, url, type, size, status, pageUrl, destination, title, formatId, statusMsg, progress, speed, downloadedSize, totalSize, createdAt, startedAt, elapsedSecs) 
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			status=excluded.status,
			destination=excluded.destination,
			title=excluded.title,
			size=excluded.size,
			formatId=excluded.formatId,
			statusMsg=excluded.statusMsg,
			progress=excluded.progress,
			speed=excluded.speed,
			downloadedSize=excluded.downloadedSize,
			totalSize=excluded.totalSize,
			createdAt=excluded.createdAt,
			startedAt=excluded.startedAt,
			elapsedSecs=excluded.elapsedSecs
	`)

	if err != nil {
		log.Printf("Error preparing statement: %v\n", err)
		tx.Rollback()
		return
	}
	defer stmt.Close()

	for _, i := range items {
		_, err = stmt.Exec(i.ID, i.URL, i.Type, i.Size, i.Status, i.PageURL, i.Destination, i.Title, i.FormatID, i.StatusMsg, i.Progress, i.Speed, i.DownloadedSize, i.TotalSize, i.CreatedAt, i.StartedAt, i.ElapsedSecs)
		if err != nil {
			log.Printf("Error executing upsert: %v\n", err)
		}
	}
	tx.Commit()
}

func (s *Store) DeleteDownload(id string) {
	if s.db == nil {
		return
	}
	_, err := s.db.Exec("DELETE FROM downloads WHERE id = ?", id)
	if err != nil {
		log.Printf("Error deleting from db: %v\n", err)
	}
	s.db.Exec("DELETE FROM download_logs WHERE download_id = ?", id)
}
