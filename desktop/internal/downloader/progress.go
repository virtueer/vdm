package downloader

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

var AnsiRegex = regexp.MustCompile(`\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\([a-zA-Z]|\)]|[0-9A-Za-z=><])`)
var YtdlpRegex = regexp.MustCompile(`\[download\]\s+([\d\.]+)%\s+of\s+~?\s*([\d\.]+\s*\w+)(?:.*?\s+at\s+([\d\.]+\s*\w+))?`)
var Aria2cRegex = regexp.MustCompile(`\[#[a-fA-F0-9]+\s+([\d\.]+\s*\w+)/([\d\.]+\s*\w+)\s*\(([\d\.]+)%\)(?:.*?\s+DL:([\d\.]+\s*\w+))?`)
var YtDlpDestRegex = regexp.MustCompile(`\[download\] Destination: (.*)`)
var YtDlpAlreadyDestRegex = regexp.MustCompile(`\[download\] (.*) has already been downloaded`)
var YtDlpMergerRegex = regexp.MustCompile(`\[Merger\] Merging formats into "(.*)"`)
var YtDlpMoveFilesRegex = regexp.MustCompile(`\[MoveFiles\] Moving file .*? to "(.*)"`)

func IsProgressLine(line string) bool {
	clean := AnsiRegex.ReplaceAllString(line, "")
	clean = strings.TrimSpace(clean)
	if strings.HasPrefix(clean, "*** Download Progress Summary") ||
		strings.HasPrefix(clean, "===") ||
		strings.HasPrefix(clean, "---") ||
		strings.HasPrefix(clean, "FILE:") {
		return true
	}
	return YtdlpRegex.MatchString(clean) || Aria2cRegex.MatchString(clean)
}

func ParseSizeToBytes(sizeStr string) int64 {
	clean := strings.TrimSpace(sizeStr)
	var val float64
	var unit string
	n, _ := fmt.Sscanf(clean, "%f%s", &val, &unit)
	if n < 1 || val <= 0 {
		return 0
	}
	unit = strings.ToUpper(unit)
	if strings.HasPrefix(unit, "G") {
		return int64(val * 1024 * 1024 * 1024)
	}
	if strings.HasPrefix(unit, "M") {
		return int64(val * 1024 * 1024)
	}
	if strings.HasPrefix(unit, "K") {
		return int64(val * 1024)
	}
	if strings.HasPrefix(unit, "B") {
		return int64(val)
	}
	return int64(val * 1024 * 1024)
}

func ParseProgressLine(id string, line string, lastEmitMs *int64, updateItem func(pct float64, speed, dlSize, totSize string), emitProgress func(payload map[string]interface{})) bool {
	cleanLine := AnsiRegex.ReplaceAllString(line, "")
	cleanLine = strings.TrimSpace(cleanLine)
	if !IsProgressLine(cleanLine) {
		return false
	}

	now := time.Now().UnixMilli()
	last := atomic.LoadInt64(lastEmitMs)
	if now-last < 250 {
		return true
	}
	atomic.StoreInt64(lastEmitMs, now)

	var pctStr, downloadedStr, totalStr, speedStr string

	if match := YtdlpRegex.FindStringSubmatch(cleanLine); match != nil {
		pctStr = strings.TrimSpace(match[1])
		totalStr = strings.TrimSpace(match[2])
		if len(match) > 3 {
			speedStr = strings.TrimSpace(match[3])
		}
	} else if match := Aria2cRegex.FindStringSubmatch(cleanLine); match != nil {
		downloadedStr = strings.TrimSpace(match[1])
		totalStr = strings.TrimSpace(match[2])
		pctStr = strings.TrimSpace(match[3])
		if len(match) > 4 {
			speedStr = strings.TrimSpace(match[4])
			if speedStr != "" && !strings.HasSuffix(speedStr, "/s") && !strings.HasSuffix(speedStr, "/S") {
				speedStr = speedStr + "/s"
			}
		}
	}

	if downloadedStr != "" && totalStr != "" {
		dlB := ParseSizeToBytes(downloadedStr)
		totB := ParseSizeToBytes(totalStr)
		if totB > 0 && dlB >= 0 {
			calcPct := (float64(dlB) / float64(totB)) * 100.0
			if calcPct >= 0 && calcPct <= 100 {
				pctStr = fmt.Sprintf("%.1f", calcPct)
			}
		}
	}

	if pctStr != "" {
		pctFloat, err := strconv.ParseFloat(pctStr, 64)
		if err == nil && updateItem != nil {
			updateItem(pctFloat, speedStr, downloadedStr, totalStr)
		}
		if emitProgress != nil {
			payload := map[string]interface{}{
				"id":         id,
				"percentage": pctStr,
				"total":      totalStr,
				"speed":      speedStr,
			}
			if downloadedStr != "" {
				payload["downloaded"] = downloadedStr
			}
			emitProgress(payload)
		}
	}
	return true
}

func EmitWailsEvent(wailsApp *application.App, eventName string, data interface{}) {
	if wailsApp != nil {
		wailsApp.Event.Emit(eventName, data)
	}
}
