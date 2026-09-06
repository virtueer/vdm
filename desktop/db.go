package main

import (
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"sync"

	_ "github.com/mattn/go-sqlite3"
)

type DB struct {
	db *sql.DB
	mu sync.Mutex
}

func getDBPath() string {
	configDir, err := os.UserConfigDir()
	if err != nil {
		homeDir, _ := os.UserHomeDir()
		configDir = filepath.Join(homeDir, ".config")
	}
	dir := filepath.Join(configDir, "vdm")
	_ = os.MkdirAll(dir, 0755)
	return filepath.Join(dir, "vdm.db")
}

func InitDB() (*DB, error) {
	dbPath := getDBPath()
	sqlDB, err := sql.Open("sqlite3", dbPath+"?_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		return nil, err
	}

	createTableSQL := `
	CREATE TABLE IF NOT EXISTS downloads (
		id TEXT PRIMARY KEY,
		url TEXT,
		title TEXT,
		destination TEXT,
		status TEXT,
		status_msg TEXT,
		error_details TEXT,
		progress REAL,
		speed TEXT,
		downloaded_size TEXT,
		total_size TEXT,
		elapsed_secs INTEGER,
		started_at INTEGER,
		created_at INTEGER,
		is_deleted INTEGER DEFAULT 0
	);
	CREATE INDEX IF NOT EXISTS idx_downloads_created ON downloads(created_at DESC);
	CREATE INDEX IF NOT EXISTS idx_downloads_deleted ON downloads(is_deleted);
	CREATE INDEX IF NOT EXISTS idx_downloads_dest ON downloads(destination);
	`
	if _, err := sqlDB.Exec(createTableSQL); err != nil {
		_ = sqlDB.Close()
		return nil, err
	}

	// Add error_details column if upgrading existing DB
	_, _ = sqlDB.Exec(`ALTER TABLE downloads ADD COLUMN error_details TEXT`)

	database := &DB{db: sqlDB}
	database.migrateFromJSONIfPresent()
	return database, nil
}

func (d *DB) migrateFromJSONIfPresent() {
	configDir, err := os.UserConfigDir()
	if err != nil {
		homeDir, _ := os.UserHomeDir()
		configDir = filepath.Join(homeDir, ".config")
	}
	vdmDir := filepath.Join(configDir, "vdm")
	historyJSON := filepath.Join(vdmDir, "history.json")
	deletedJSON := filepath.Join(vdmDir, "deleted.json")

	// Migrate deleted.json if exists
	if data, err := os.ReadFile(deletedJSON); err == nil {
		var list []string
		if err := json.Unmarshal(data, &list); err == nil {
			for _, p := range list {
				if p != "" {
					_, _ = d.db.Exec(`UPDATE downloads SET is_deleted = 1 WHERE destination = ? OR url = ?`, p, p)
				}
			}
		}
		_ = os.Remove(deletedJSON)
	}

	// Migrate history.json if DB has 0 items
	var count int
	_ = d.db.QueryRow(`SELECT COUNT(*) FROM downloads`).Scan(&count)
	if count == 0 {
		if data, err := os.ReadFile(historyJSON); err == nil {
			var list []DownloadItem
			if err := json.Unmarshal(data, &list); err == nil {
				for _, item := range list {
					_ = d.SaveDownload(item)
				}
			}
		}
	}
	_ = os.Remove(historyJSON)
}

func (d *DB) GetAllActiveDownloads() []DownloadItem {
	d.mu.Lock()
	defer d.mu.Unlock()

	rows, err := d.db.Query(`
		SELECT id, url, title, destination, status, status_msg, COALESCE(error_details, ''), progress, speed, downloaded_size, total_size, elapsed_secs, started_at, created_at
		FROM downloads
		WHERE is_deleted = 0
		ORDER BY created_at DESC
	`)
	if err != nil {
		return []DownloadItem{}
	}
	defer rows.Close()

	var list []DownloadItem
	for rows.Next() {
		var item DownloadItem
		err := rows.Scan(
			&item.ID, &item.URL, &item.Title, &item.Destination,
			&item.Status, &item.StatusMsg, &item.ErrorDetails, &item.Progress, &item.Speed,
			&item.DownloadedSize, &item.TotalSize, &item.ElapsedSecs,
			&item.StartedAt, &item.CreatedAt,
		)
		if err == nil {
			if item.Status == "downloading" || item.Status == "pending" {
				item.Status = "paused"
				item.StatusMsg = "Paused"
				item.Speed = ""
			}
			if item.Destination != "" {
				if fi, errStat := os.Stat(item.Destination); errStat == nil {
					if item.TotalSize == "" || item.TotalSize == "Unknown" || item.TotalSize == "0 B" {
						item.TotalSize = formatBytes(fi.Size())
						item.DownloadedSize = formatBytes(fi.Size())
					}
				}
			}
			list = append(list, item)
		}
	}
	return list
}

func (d *DB) SaveDownload(item DownloadItem) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	query := `
	INSERT INTO downloads (id, url, title, destination, status, status_msg, error_details, progress, speed, downloaded_size, total_size, elapsed_secs, started_at, created_at, is_deleted)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
	ON CONFLICT(id) DO UPDATE SET
		url = excluded.url,
		title = excluded.title,
		destination = excluded.destination,
		status = excluded.status,
		status_msg = excluded.status_msg,
		error_details = excluded.error_details,
		progress = excluded.progress,
		speed = excluded.speed,
		downloaded_size = excluded.downloaded_size,
		total_size = excluded.total_size,
		elapsed_secs = excluded.elapsed_secs,
		started_at = excluded.started_at,
		created_at = excluded.created_at,
		is_deleted = 0;
	`
	_, err := d.db.Exec(query,
		item.ID, item.URL, item.Title, item.Destination,
		item.Status, item.StatusMsg, item.ErrorDetails, item.Progress, item.Speed,
		item.DownloadedSize, item.TotalSize, item.ElapsedSecs,
		item.StartedAt, item.CreatedAt,
	)
	return err
}

func (d *DB) MarkDeleted(id string) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	_, err := d.db.Exec(`UPDATE downloads SET is_deleted = 1 WHERE id = ?`, id)
	return err
}

func (d *DB) HardDelete(id string) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	_, err := d.db.Exec(`DELETE FROM downloads WHERE id = ?`, id)
	return err
}

func (d *DB) IsDeleted(destPath, filename string) bool {
	d.mu.Lock()
	defer d.mu.Unlock()
	var count int
	cleanPath := filepath.Clean(destPath)
	err := d.db.QueryRow(`
		SELECT COUNT(*) FROM downloads 
		WHERE is_deleted = 1 AND (destination = ? OR destination LIKE ? OR url = ? OR title = ?)
	`, cleanPath, "%"+filename, filename, filename).Scan(&count)
	return err == nil && count > 0
}

func (d *DB) Close() {
	if d.db != nil {
		_ = d.db.Close()
	}
}
