package downloader

import (
	"context"
	"io"
	"os/exec"
	"sync"
	"time"
)

func (m *Manager) handleStreamScanning(id string, downloadUrl string, stdout io.ReadCloser, stderr io.ReadCloser, cmd *exec.Cmd, cancel context.CancelFunc) {
	var lastEmitMs int64
	var wg sync.WaitGroup
	wg.Add(2)

	moveFilesChan := make(chan struct{}, 1)

	go func() {
		defer wg.Done()
		m.scanStdoutStream(id, stdout, &lastEmitMs, moveFilesChan)
	}()

	go func() {
		defer wg.Done()
		m.scanStderrStream(id, stderr, &lastEmitMs)
	}()

	cmdDone := make(chan error, 1)
	go func() {
		if cmd != nil {
			cmdDone <- cmd.Wait()
		} else {
			cmdDone <- nil
		}
	}()

	var err error
	select {
	case err = <-cmdDone:
		// Process completed normally
	case <-moveFilesChan:
		select {
		case err = <-cmdDone:
			// Process exited within 2 seconds after [MoveFiles]
		case <-time.After(2 * time.Second):
			// Process hanging after [MoveFiles] (e.g. aria2c/node pipe leak). Force completion.
			m.Logf("Download %s: Process hanging after [MoveFiles], forcing completion...\n", id)
			if cmd != nil && cmd.Process != nil {
				cmd.Process.Kill()
			}
			if cancel != nil {
				cancel()
			}
			err = nil
		}
	}

	// Instantly finalize download status to completed/error without blocking on scanner goroutines
	m.finalizeDownloadStatus(id, downloadUrl, err)

	// Clean up pipes and scanner goroutines asynchronously
	go func() {
		if stdout != nil {
			stdout.Close()
		}
		if stderr != nil {
			stderr.Close()
		}
		done := make(chan struct{})
		go func() {
			wg.Wait()
			close(done)
		}()
		select {
		case <-done:
		case <-time.After(2 * time.Second):
		}
	}()
}
