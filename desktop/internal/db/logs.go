package db

func (s *Store) SaveTerminalLog(msg string) {
	if s.db != nil {
		s.db.Exec("INSERT INTO terminal_logs (message) VALUES (?)", msg)
	}
}

func (s *Store) ClearTerminalLogs() {
	if s.db != nil {
		s.db.Exec("DELETE FROM terminal_logs")
	}
}

func (s *Store) GetTerminalLogs(fallback []string) []string {
	if s.db == nil {
		return fallback
	}
	rows, err := s.db.Query("SELECT message FROM terminal_logs ORDER BY id DESC LIMIT 500")
	if err != nil {
		return fallback
	}
	defer rows.Close()

	var logs []string
	for rows.Next() {
		var m string
		if err := rows.Scan(&m); err == nil {
			logs = append(logs, m)
		}
	}
	for i, j := 0, len(logs)-1; i < j; i, j = i+1, j-1 {
		logs[i], logs[j] = logs[j], logs[i]
	}
	return logs
}

func (s *Store) SaveDownloadLog(downloadID string, msg string) {
	if s.db != nil {
		s.db.Exec("INSERT INTO download_logs (download_id, message) VALUES (?, ?)", downloadID, msg)
	}
}

func (s *Store) GetDownloadLogs(downloadID string) []string {
	if s.db == nil {
		return nil
	}
	rows, err := s.db.Query("SELECT message FROM download_logs WHERE download_id = ? ORDER BY id ASC", downloadID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var logs []string
	for rows.Next() {
		var m string
		if err := rows.Scan(&m); err == nil {
			logs = append(logs, m)
		}
	}
	return logs
}
