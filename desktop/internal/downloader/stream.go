package downloader

import (
	"io"
	"sync"
)

func (m *Manager) handleStreamScanning(id string, downloadUrl string, stdout io.ReadCloser, stderr io.ReadCloser, waitCmd func() error) {
	var lastEmitMs int64
	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		m.scanStdoutStream(id, stdout, &lastEmitMs)
	}()

	go func() {
		defer wg.Done()
		m.scanStderrStream(id, stderr, &lastEmitMs)
	}()

	err := waitCmd()
	wg.Wait()
	m.finalizeDownloadStatus(id, downloadUrl, err)
}
