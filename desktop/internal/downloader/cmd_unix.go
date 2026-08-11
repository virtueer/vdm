//go:build !windows

package downloader

import (
	"os/exec"
	"syscall"
)

func PrepareCmd(cmd *exec.Cmd) {
	if cmd == nil {
		return
	}
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error {
		if cmd.Process != nil && cmd.Process.Pid > 0 {
			// Send SIGTERM to process group so aria2c/yt-dlp flush control & part files and exit immediately
			return syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM)
		}
		return nil
	}
}
