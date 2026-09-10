package main

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// shrinkBackoff keeps the retry tests fast without changing the logic.
func shrinkBackoff(t *testing.T) {
	t.Helper()
	base, max := baseRetryDelay, maxRetryDelay
	baseRetryDelay = time.Millisecond
	maxRetryDelay = 5 * time.Millisecond
	t.Cleanup(func() {
		baseRetryDelay, maxRetryDelay = base, max
	})
}

func TestRetryableStatus(t *testing.T) {
	retryable := []int{408, 429, 500, 502, 503, 504, 509, 522, 524}
	for _, code := range retryable {
		if !retryableStatus(code) {
			t.Errorf("status %d should be retryable", code)
		}
	}

	permanent := []int{200, 206, 301, 400, 401, 403, 404, 410, 451}
	for _, code := range permanent {
		if retryableStatus(code) {
			t.Errorf("status %d should not be retryable", code)
		}
	}
}

func TestRetryDelayGrowsExponentiallyAndCaps(t *testing.T) {
	// attempt 1..4 double: 1s, 2s, 4s, 8s (+ up to 25% jitter)
	for attempt, want := range map[int]time.Duration{1: time.Second, 2: 2 * time.Second, 3: 4 * time.Second, 4: 8 * time.Second} {
		got := retryDelay(attempt, "")
		if got < want || got > want+want/4 {
			t.Errorf("attempt %d: delay %v outside [%v, %v]", attempt, got, want, want+want/4)
		}
	}

	// far-out attempts stay at the cap (plus jitter)
	if got := retryDelay(20, ""); got < maxRetryDelay || got > maxRetryDelay+maxRetryDelay/4 {
		t.Errorf("attempt 20: delay %v should sit at the %v cap", got, maxRetryDelay)
	}
}

func TestRetryDelayHonoursRetryAfter(t *testing.T) {
	if got := retryDelay(1, "3"); got != 3*time.Second {
		t.Errorf("Retry-After 3s: got %v", got)
	}

	// A hostile header cannot park a download beyond the cap.
	if got := retryDelay(1, "9000"); got != maxRetryDelay {
		t.Errorf("Retry-After 9000s should clamp to %v, got %v", maxRetryDelay, got)
	}

	// An HTTP date in the future is honoured, in the past means "now".
	future := time.Now().Add(2 * time.Second).UTC().Format(http.TimeFormat)
	if got := retryDelay(1, future); got <= 0 || got > 3*time.Second {
		t.Errorf("Retry-After date: got %v", got)
	}
	// A stale date tells us nothing, so the normal backoff applies.
	if got := retryDelay(1, time.Now().Add(-time.Hour).UTC().Format(http.TimeFormat)); got < baseRetryDelay {
		t.Errorf("stale Retry-After should fall back to backoff, got %v", got)
	}

	// Garbage falls back to the exponential schedule.
	if got := retryDelay(1, "soon"); got < time.Second {
		t.Errorf("unparseable Retry-After should fall back to backoff, got %v", got)
	}
}

func TestDoWithRetryRecoversFromRateLimit(t *testing.T) {
	shrinkBackoff(t)

	var hits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if atomic.AddInt32(&hits, 1) <= 2 {
			w.Header().Set("Retry-After", "0")
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		fmt.Fprint(w, "ok")
	}))
	defer srv.Close()

	var notified int
	resp, err := doWithRetry(context.Background(), maxRetryAttempts, func() (*http.Request, error) {
		return mediaRequest(context.Background(), "GET", srv.URL)
	}, func(int, time.Duration, string) { notified++ })
	if err != nil {
		t.Fatalf("expected recovery after 429s, got %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
	if got := atomic.LoadInt32(&hits); got != 3 {
		t.Errorf("request count = %d, want 3", got)
	}
	if notified != 2 {
		t.Errorf("notified %d times, want 2 (one per retry)", notified)
	}
}

func TestDoWithRetryGivesUpAndDoesNotRetryPermanentStatus(t *testing.T) {
	shrinkBackoff(t)

	var limited, missing int32
	limitedSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&limited, 1)
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer limitedSrv.Close()

	if _, err := doWithRetry(context.Background(), maxRetryAttempts, func() (*http.Request, error) {
		return mediaRequest(context.Background(), "GET", limitedSrv.URL)
	}, nil); err == nil {
		t.Fatal("expected an error once the budget is spent")
	}
	if got := atomic.LoadInt32(&limited); got != maxRetryAttempts {
		t.Errorf("attempts = %d, want %d", got, maxRetryAttempts)
	}

	missingSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&missing, 1)
		w.WriteHeader(http.StatusNotFound)
	}))
	defer missingSrv.Close()

	resp, err := doWithRetry(context.Background(), maxRetryAttempts, func() (*http.Request, error) {
		return mediaRequest(context.Background(), "GET", missingSrv.URL)
	}, nil)
	if err != nil {
		t.Fatalf("a 404 should come back as a response, got %v", err)
	}
	resp.Body.Close()
	if got := atomic.LoadInt32(&missing); got != 1 {
		t.Errorf("404 was requested %d times, want 1 (no retries)", got)
	}
}

func TestDoWithRetryStopsOnCancel(t *testing.T) {
	baseRetryDelay, maxRetryDelay := baseRetryDelay, maxRetryDelay
	_, _ = baseRetryDelay, maxRetryDelay // keep the real (long) delays for this one

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(50 * time.Millisecond)
		cancel()
	}()

	start := time.Now()
	if _, err := doWithRetry(ctx, maxRetryAttempts, func() (*http.Request, error) {
		return mediaRequest(ctx, "GET", srv.URL)
	}, nil); err == nil {
		t.Fatal("expected an error after cancellation")
	}
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Errorf("cancel took %v to take effect; backoff should be interruptible", elapsed)
	}
}

// rangeBody serves payload with Range support so resume paths can be exercised.
func rangeBody(w http.ResponseWriter, r *http.Request, payload []byte) (start int64, ok bool) {
	w.Header().Set("Accept-Ranges", "bytes")

	if rng := r.Header.Get("Range"); strings.HasPrefix(rng, "bytes=") {
		spec := strings.TrimPrefix(rng, "bytes=")
		parts := strings.SplitN(spec, "-", 2)
		from, err := strconv.ParseInt(parts[0], 10, 64)
		if err != nil || from >= int64(len(payload)) {
			w.WriteHeader(http.StatusRequestedRangeNotSatisfiable)
			return 0, false
		}
		to := int64(len(payload)) - 1
		if len(parts) == 2 && parts[1] != "" {
			if parsed, err := strconv.ParseInt(parts[1], 10, 64); err == nil && parsed < to {
				to = parsed
			}
		}
		w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", from, to, len(payload)))
		w.Header().Set("Content-Length", strconv.FormatInt(to-from+1, 10))
		w.WriteHeader(http.StatusPartialContent)
		return from, true
	}

	w.Header().Set("Content-Length", strconv.Itoa(len(payload)))
	w.WriteHeader(http.StatusOK)
	return 0, true
}

func testPayload(size int) []byte {
	payload := make([]byte, size)
	for i := range payload {
		payload[i] = byte(i % 251)
	}
	return payload
}

func TestSingleStreamSurvivesRateLimitAndDroppedConnection(t *testing.T) {
	shrinkBackoff(t)

	payload := testPayload(400 * 1024)
	var hits int32

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch atomic.AddInt32(&hits, 1) {
		case 1:
			// The failure the user hit: rate limited before a single byte.
			w.Header().Set("Retry-After", "0")
			w.WriteHeader(http.StatusTooManyRequests)
		case 2:
			// Connection dies mid-body after some bytes land.
			start, ok := rangeBody(w, r, payload)
			if !ok {
				return
			}
			_, _ = w.Write(payload[start : start+1024])
			if f, canFlush := w.(http.Flusher); canFlush {
				f.Flush()
			}
			panic(http.ErrAbortHandler)
		default:
			start, ok := rangeBody(w, r, payload)
			if !ok {
				return
			}
			_, _ = w.Write(payload[start:])
		}
	}))
	defer srv.Close()

	dir := t.TempDir()
	dest := filepath.Join(dir, "video.mp4")
	m := &Manager{}

	if err := m.downloadSingleStream(context.Background(), "test", srv.URL, dest, dest+".part", -1); err != nil {
		t.Fatalf("download should have recovered: %v", err)
	}

	got, err := os.ReadFile(dest)
	if err != nil {
		t.Fatalf("reading result: %v", err)
	}
	if !bytes.Equal(got, payload) {
		t.Fatalf("file is %d bytes, want %d and identical content", len(got), len(payload))
	}
	if _, err := os.Stat(dest + ".part"); !os.IsNotExist(err) {
		t.Error("the .part file should be gone after finalising")
	}
}

func TestSingleStreamFailsFastOnPermanentError(t *testing.T) {
	shrinkBackoff(t)

	var hits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		w.WriteHeader(http.StatusForbidden)
	}))
	defer srv.Close()

	dir := t.TempDir()
	dest := filepath.Join(dir, "video.mp4")
	m := &Manager{}

	if err := m.downloadSingleStream(context.Background(), "test", srv.URL, dest, dest+".part", -1); err == nil {
		t.Fatal("a 403 should fail the download")
	}
	if got := atomic.LoadInt32(&hits); got != 1 {
		t.Errorf("requests = %d, want 1: a permanent status must not be retried", got)
	}
}

func TestMultipartDownloadSurvivesRateLimitedWorkers(t *testing.T) {
	shrinkBackoff(t)

	// Over the 4 MB threshold, so downloadDirect picks the multi-part path.
	payload := testPayload(5 * 1024 * 1024)
	var hits int32

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := atomic.AddInt32(&hits, 1)

		if r.Method == http.MethodHead {
			w.Header().Set("Accept-Ranges", "bytes")
			w.Header().Set("Content-Length", strconv.Itoa(len(payload)))
			w.WriteHeader(http.StatusOK)
			return
		}

		// Every third request is rate limited, so most workers hit one.
		if n%3 == 0 {
			w.Header().Set("Retry-After", "0")
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}

		start, ok := rangeBody(w, r, payload)
		if !ok {
			return
		}
		end := int64(len(payload))
		if cr := w.Header().Get("Content-Range"); cr != "" {
			var from, to, total int64
			if _, err := fmt.Sscanf(cr, "bytes %d-%d/%d", &from, &to, &total); err == nil {
				end = to + 1
			}
		}
		_, _ = w.Write(payload[start:end])
	}))
	defer srv.Close()

	dir := t.TempDir()
	dest := filepath.Join(dir, "movie.mp4")
	m := &Manager{}

	if err := m.downloadDirect(context.Background(), "test", srv.URL, dest); err != nil {
		t.Fatalf("multi-part download should have recovered: %v", err)
	}

	got, err := os.ReadFile(dest)
	if err != nil {
		t.Fatalf("reading result: %v", err)
	}
	if !bytes.Equal(got, payload) {
		t.Fatalf("file is %d bytes, want %d and identical content", len(got), len(payload))
	}
	if _, err := os.Stat(dest + ".vdm_state"); !os.IsNotExist(err) {
		t.Error("the resume state file should be cleaned up")
	}
}
