package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type blockingPlanner struct{ release chan struct{} }

func (p blockingPlanner) Plan(ctx context.Context, _ time.Time) error {
	select {
	case <-p.release:
	case <-ctx.Done():
	}
	return nil
}

var fixedNow = func() time.Time { return time.Date(2026, 10, 2, 20, 0, 0, 0, time.UTC) } // 3 Oct 01:30 in Colombo

func newTestServer(p Planner) http.Handler {
	mux := http.NewServeMux()
	(&API{store: stubStore{}, runs: NewRunManager(p, time.Minute), now: fixedNow}).routes(mux)
	return mux
}

func do(t *testing.T, h http.Handler, method, path, body string) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return rec, out
}

func TestSummaryCoversBothDepots(t *testing.T) {
	rec, out := do(t, newTestServer(stubPlanner{}), "GET", "/schedule/summary", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	if out["date"] != "2026-10-03" {
		t.Errorf("default date = %v, want today in Colombo (2026-10-03)", out["date"])
	}
	if n := len(out["depots"].([]any)); n != 2 {
		t.Errorf("depots = %d, want 2", n)
	}
	totals := out["totals"].(map[string]any)
	if totals["vehiclesUsed"].(float64) != 3 || totals["trips"].(float64) != 3 || totals["ordersDeferred"].(float64) != 2 {
		t.Errorf("totals = %v", totals)
	}
}

func TestDepotSchedule(t *testing.T) {
	h := newTestServer(stubPlanner{})
	rec, out := do(t, h, "GET", "/depots/peliyagoda/schedule?date=2026-10-05", "")
	if rec.Code != http.StatusOK || out["depot"] != "Peliyagoda" || out["date"] != "2026-10-05" {
		t.Fatalf("status %d body %v", rec.Code, out)
	}
	if rec, _ := do(t, h, "GET", "/depots/Galle/schedule", ""); rec.Code != http.StatusNotFound {
		t.Errorf("unknown depot: status %d, want 404", rec.Code)
	}
	if rec, _ := do(t, h, "GET", "/depots/Kandy/schedule?date=05-10-2026", ""); rec.Code != http.StatusBadRequest {
		t.Errorf("bad date: status %d, want 400", rec.Code)
	}
}

func TestDeferralsFilterByDepot(t *testing.T) {
	h := newTestServer(stubPlanner{})
	_, all := do(t, h, "GET", "/schedule/deferrals", "")
	_, kandy := do(t, h, "GET", "/schedule/deferrals?depot=Kandy", "")
	if all["count"].(float64) != 2 || kandy["count"].(float64) != 0 {
		t.Errorf("all = %v, kandy = %v", all["count"], kandy["count"])
	}
	order := all["orders"].([]any)[0].(map[string]any)
	if order["reason"] == "" || order["reasonDetail"] == "" {
		t.Errorf("deferral without a reason: %v", order)
	}
}

func TestStartPlanningDefaultsToTomorrowAndRejectsDuplicates(t *testing.T) {
	p := blockingPlanner{release: make(chan struct{})}
	defer close(p.release)
	h := newTestServer(p)

	rec, run := do(t, h, "POST", "/planning-runs", "")
	if rec.Code != http.StatusAccepted || run["planDate"] != "2026-10-04" || run["trigger"] != "cron" {
		t.Fatalf("status %d body %v", rec.Code, run)
	}
	rec, dup := do(t, h, "POST", "/planning-runs", `{"planDate":"2026-10-04"}`)
	if rec.Code != http.StatusConflict || dup["runId"] != run["runId"] {
		t.Errorf("duplicate: status %d body %v", rec.Code, dup)
	}
	if rec, _ := do(t, h, "POST", "/planning-runs", `{"planDate":"2026-10-01"}`); rec.Code != http.StatusBadRequest {
		t.Errorf("past date: status %d, want 400", rec.Code)
	}
	if rec, _ := do(t, h, "POST", "/planning-runs", `{bad json`); rec.Code != http.StatusBadRequest {
		t.Errorf("bad json: status %d, want 400", rec.Code)
	}
}

func TestRunCompletes(t *testing.T) {
	m := NewRunManager(stubPlanner{}, time.Minute)
	run, _ := m.Start(time.Date(2026, 10, 4, 0, 0, 0, 0, sriLanka), "manual")
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if r, _ := m.Get(run.RunID); r.Status == RunCompleted {
			if _, again := m.Start(time.Date(2026, 10, 4, 0, 0, 0, 0, sriLanka), "manual"); !again {
				t.Error("a new run should be allowed once the previous one finished")
			}
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("run did not complete")
}
