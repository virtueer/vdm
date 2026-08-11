package db

import (
	"database/sql"
	"log"
	"os"
	"path/filepath"

	_ "github.com/mattn/go-sqlite3"
)

type Store struct {
	db *sql.DB
}

func NewStore() *Store {
	s := &Store{}
	s.initDB()
	return s
}

func (s *Store) DB() *sql.DB {
	return s.db
}

func GetHistoryPath() string {
	homeDir, _ := os.UserHomeDir()
	return filepath.Join(homeDir, ".vdm", "downloads.db")
}

func (s *Store) initDB() {
	path := GetHistoryPath()
	os.MkdirAll(filepath.Dir(path), 0755)

	db, err := sql.Open("sqlite3", path)
	if err != nil {
		log.Fatalf("Failed to open sqlite db: %v", err)
	}
	s.db = db

	createTableQuery := `
	CREATE TABLE IF NOT EXISTS downloads (
		id TEXT PRIMARY KEY,
		url TEXT,
		type TEXT,
		size TEXT,
		status TEXT,
		pageUrl TEXT,
		destination TEXT,
		title TEXT,
		formatId TEXT,
		statusMsg TEXT,
		progress REAL DEFAULT 0,
		speed TEXT DEFAULT '',
		downloadedSize TEXT DEFAULT '',
		totalSize TEXT DEFAULT '',
		createdAt INTEGER DEFAULT 0,
		startedAt INTEGER DEFAULT 0,
		elapsedSecs INTEGER DEFAULT 0
	);

	CREATE TABLE IF NOT EXISTS download_logs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		download_id TEXT,
		message TEXT
	);

	CREATE TABLE IF NOT EXISTS terminal_logs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		message TEXT
	);
	`
	_, err = db.Exec(createTableQuery)
	if err != nil {
		log.Fatalf("Failed to create downloads table: %v", err)
	}

	db.Exec("ALTER TABLE downloads ADD COLUMN formatId TEXT;")
	db.Exec("ALTER TABLE downloads ADD COLUMN statusMsg TEXT;")
	db.Exec("ALTER TABLE downloads ADD COLUMN progress REAL DEFAULT 0;")
	db.Exec("ALTER TABLE downloads ADD COLUMN speed TEXT DEFAULT '';")
	db.Exec("ALTER TABLE downloads ADD COLUMN downloadedSize TEXT DEFAULT '';")
	db.Exec("ALTER TABLE downloads ADD COLUMN totalSize TEXT DEFAULT '';")
	db.Exec("ALTER TABLE downloads ADD COLUMN createdAt INTEGER DEFAULT 0;")
	db.Exec("ALTER TABLE downloads ADD COLUMN startedAt INTEGER DEFAULT 0;")
	db.Exec("ALTER TABLE downloads ADD COLUMN elapsedSecs INTEGER DEFAULT 0;")
}
