package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Media hosts rate limit (429) and blip (5xx, reset connections) as a matter of
// course, so a failed request backs off and retries instead of failing the whole
// download. Retries are jittered because a multi-part download hits the same
// host with up to 16 connections at once.
const (
	maxRetryAttempts = 6
	probeAttempts    = 3
)

// Delays are variables so tests can shrink them.
var (
	baseRetryDelay = time.Second
	maxRetryDelay  = 30 * time.Second
)

const browserUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"

// retryableStatus reports whether a response status is worth another attempt.
func retryableStatus(code int) bool {
	switch code {
	case http.StatusRequestTimeout, // 408
		http.StatusTooManyRequests,     // 429
		http.StatusInternalServerError, // 500
		http.StatusBadGateway,          // 502
		http.StatusServiceUnavailable,  // 503
		http.StatusGatewayTimeout,      // 504
		509,                            // bandwidth limit exceeded
		521, 522, 523, 524:             // Cloudflare origin unreachable/timeout
		return true
	}
	return false
}

// retryableError reports whether a transport or read error is worth another
// attempt. A cancelled context (pause, delete) never is, and neither is a
// permanently malformed target.
func retryableError(ctx context.Context, err error) bool {
	if err == nil || errors.Is(err, io.EOF) {
		return false
	}
	if ctx.Err() != nil || errors.Is(err, context.Canceled) {
		return false
	}
	if strings.Contains(err.Error(), "unsupported protocol scheme") {
		return false
	}
	// What is left are network-level failures: timeouts, resets, truncated
	// bodies, DNS hiccups — all transient by nature.
	return true
}

// parseRetryAfter understands both forms of the header: a delay in seconds and
// an HTTP date. Only a positive wait is reported — a zero, negative or stale
// value means the header tells us nothing useful, and hammering a server that
// just rate limited us is worse than waiting out the normal backoff.
func parseRetryAfter(value string) (time.Duration, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0, false
	}
	if secs, err := strconv.Atoi(value); err == nil {
		if secs <= 0 {
			return 0, false
		}
		return time.Duration(secs) * time.Second, true
	}
	if when, err := http.ParseTime(value); err == nil {
		if wait := time.Until(when); wait > 0 {
			return wait, true
		}
	}
	return 0, false
}

// retryDelay doubles per attempt (1s, 2s, 4s, …) up to a cap, plus jitter. A
// server-sent Retry-After wins, still capped so a hostile header cannot park a
// download for an hour.
func retryDelay(attempt int, retryAfter string) time.Duration {
	if wait, ok := parseRetryAfter(retryAfter); ok {
		if wait > maxRetryDelay {
			return maxRetryDelay
		}
		return wait
	}

	if attempt < 1 {
		attempt = 1
	}
	delay := baseRetryDelay
	for i := 1; i < attempt && delay < maxRetryDelay; i++ {
		delay *= 2
	}
	if delay > maxRetryDelay {
		delay = maxRetryDelay
	}
	return delay + time.Duration(rand.Int63n(int64(delay/4)+1))
}

// sleepCtx waits out a backoff, but wakes early when the download is paused or
// removed.
func sleepCtx(ctx context.Context, d time.Duration) error {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

// retryNotifier reports a pending retry so the UI can show what is happening
// instead of looking stalled.
type retryNotifier func(attempt int, wait time.Duration, reason string)

// mediaRequest builds a request with the browser-ish headers media hosts expect.
func mediaRequest(ctx context.Context, method, rawURL string) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, method, rawURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", browserUserAgent)
	req.Header.Set("Accept", "*/*")
	if parsed, err := url.Parse(rawURL); err == nil && parsed.Host != "" {
		origin := parsed.Scheme + "://" + parsed.Host
		req.Header.Set("Referer", origin+"/")
		req.Header.Set("Origin", origin)
	}
	return req, nil
}

// doWithRetry issues the request, retrying transport errors and retryable
// statuses with exponential backoff. The request is rebuilt for every attempt so
// callers can move a Range header forward as bytes land.
func doWithRetry(
	ctx context.Context,
	attempts int,
	mkReq func() (*http.Request, error),
	notify retryNotifier,
) (*http.Response, error) {
	if attempts < 1 {
		attempts = 1
	}

	var lastErr error
	for attempt := 1; attempt <= attempts; attempt++ {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}

		req, err := mkReq()
		if err != nil {
			return nil, err
		}

		resp, err := defaultClient.Do(req)
		if err == nil && !retryableStatus(resp.StatusCode) {
			return resp, nil
		}

		var retryAfter, reason string
		if err != nil {
			if !retryableError(ctx, err) {
				return nil, err
			}
			lastErr = err
			reason = err.Error()
		} else {
			retryAfter = resp.Header.Get("Retry-After")
			reason = resp.Status
			lastErr = fmt.Errorf("HTTP %s", resp.Status)
			// Drain a little before closing so the connection can be reused.
			_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
			resp.Body.Close()
		}

		if attempt == attempts {
			break
		}

		wait := retryDelay(attempt, retryAfter)
		if notify != nil {
			notify(attempt, wait, reason)
		}
		if err := sleepCtx(ctx, wait); err != nil {
			return nil, err
		}
	}

	return nil, fmt.Errorf("%d denemeden sonra vazgeçildi: %w", attempts, lastErr)
}

// notifyRetry keeps the item in its downloading state while telling the UI why
// it paused and for how long.
func (m *Manager) notifyRetry(id string) retryNotifier {
	return func(attempt int, wait time.Duration, reason string) {
		msg := fmt.Sprintf("%s — %s sonra yeniden denenecek (%d/%d)",
			reason, wait.Round(time.Second), attempt, maxRetryAttempts)

		m.mu.Lock()
		defer m.mu.Unlock()
		for i, item := range m.downloads {
			if item.ID != id {
				continue
			}
			m.downloads[i].StatusMsg = msg
			m.downloads[i].Speed = "0 B/s"
			m.saveItemLocked(m.downloads[i])
			if m.wailsApp != nil {
				m.wailsApp.Event.Emit("download_updated", m.downloads[i])
			}
			break
		}
	}
}
