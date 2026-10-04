package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// memStore is an in-memory ScheduleStore + RunStore + PlanWriter.
type memStore struct {
	mu    sync.Mutex
	runs  map[string]PlanningRun
	plans map[string]*Plan
}

func newMemStore() *memStore {
	return &memStore{runs: map[string]PlanningRun{}, plans: map[string]*Plan{}}
}

func (s *memStore) completed(date string) (string, *Plan) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, r := range s.runs {
		if r.PlanDate == date && r.Status == RunCompleted {
			return id, s.plans[id]
		}
	}
	return "", nil
}

func (s *memStore) FleetSize(_ context.Context, date time.Time, depot string) (int, error) {
	_, p := s.completed(date.Format(dateLayout))
	if p == nil {
		return 0, nil
	}
	return p.FleetAvailable[depot], nil
}

func (s *memStore) DepotSchedule(_ context.Context, date time.Time, depot string) (DepotSchedule, error) {
	out := DepotSchedule{Date: date.Format(dateLayout), Depot: depot, Vehicles: []VehicleSchedule{}}
	id, p := s.completed(out.Date)
	if p == nil {
		return out, nil
	}
	out.PlanRunID = id
	for _, t := range p.Trips {
		if t.Depot != depot {
			continue
		}
		n := len(out.Vehicles)
		if n == 0 || out.Vehicles[n-1].VehicleID != t.VehicleID {
			out.Vehicles = append(out.Vehicles, VehicleSchedule{VehicleID: t.VehicleID, Type: t.VehicleType,
				Temperature: t.VehicleTemp, WeightCapacityKg: t.WeightCapacityKg, VolumeCapacityM3: t.VolumeCapacityM3})
			n++
		}
		out.Vehicles[n-1].Trips = append(out.Vehicles[n-1].Trips, t.Trip)
	}
	return out, nil
}

func (s *memStore) DeferredOrders(_ context.Context, date time.Time, depot string) ([]DeferredOrder, error) {
	out := []DeferredOrder{}
	if _, p := s.completed(date.Format(dateLayout)); p != nil {
		for _, d := range p.Deferrals {
			if depot == "" || d.Depot == depot {
				out = append(out, d)
			}
		}
	}
	return out, nil
}

func (s *memStore) Trip(_ context.Context, id string) (*TripDetail, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for runID, p := range s.plans {
		if s.runs[runID].Status != RunCompleted {
			continue
		}
		for _, t := range p.Trips {
			if t.TripID == id {
				return &t, nil
			}
		}
	}
	return nil, nil
}

func (s *memStore) Trips(_ context.Context, date time.Time, depot, vehicleID string) ([]TripDetail, error) {
	out := []TripDetail{}
	if _, p := s.completed(date.Format(dateLayout)); p != nil {
		for _, t := range p.Trips {
			if (depot == "" || t.Depot == depot) && (vehicleID == "" || t.VehicleID == vehicleID) {
				out = append(out, t)
			}
		}
	}
	return out, nil
}

func (s *memStore) CreateRun(_ context.Context, run PlanningRun) (PlanningRun, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, r := range s.runs {
		if r.PlanDate == run.PlanDate && r.Status != RunFailed {
			return r, false, nil
		}
	}
	s.runs[run.RunID] = run
	return run, true, nil
}

func (s *memStore) UpdateRun(_ context.Context, run PlanningRun) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.runs[run.RunID] = run
	return nil
}

func (s *memStore) GetRun(_ context.Context, id string) (PlanningRun, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r, ok := s.runs[id]
	return r, ok, nil
}

func (s *memStore) ListRuns(_ context.Context, date string) ([]PlanningRun, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := []PlanningRun{}
	for _, r := range s.runs {
		if r.PlanDate == date {
			out = append(out, r)
		}
	}
	return out, nil
}

func (s *memStore) BlockingRun(_ context.Context, date string) (*PlanningRun, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, r := range s.runs {
		if r.PlanDate == date && r.Status != RunFailed {
			return &r, nil
		}
	}
	return nil, nil
}

func (s *memStore) CountFailedRuns(_ context.Context, date, trigger string) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	n := 0
	for _, r := range s.runs {
		if r.PlanDate == date && r.Trigger == trigger && r.Status == RunFailed {
			n++
		}
	}
	return n, nil
}

func (s *memStore) FailInterruptedRuns(context.Context) (int, error) { return 0, nil }

func (s *memStore) SavePlan(_ context.Context, runID string, _ time.Time, plan *Plan) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.plans[runID] = plan
	return nil
}

func (s *memStore) DiscardPlan(_ context.Context, runID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.plans, runID)
	return nil
}

// seed stores a completed run for date with the given plan.
func (s *memStore) seed(date string, plan *Plan) string {
	id := "run_" + strings.ReplaceAll(date, "-", "")
	s.runs[id] = PlanningRun{RunID: id, PlanDate: date, Status: RunCompleted, Trigger: "cron"}
	s.plans[id] = plan
	return id
}

func samplePlan(date string) *Plan {
	trip := func(veh, depot, typ, temp string, n int, brand, district string, capKg, capM3 float64, stops ...Stop) TripDetail {
		id := strings.ReplaceAll(date, "-", "") + "-" + veh + "-T" + string(rune('0'+n))
		t := Trip{TripID: id, TripNumber: n, Brand: brand, District: district, DepartureTime: "03:30", ReturnTime: "05:42",
			DurationMin: 108, DistanceKm: 40, FuelLitres: 8.5, Stops: stops}
		for i := range t.Stops {
			t.Stops[i].StopID = id + "-S" + string(rune('1'+i))
			t.WeightKg += t.Stops[i].WeightKg
			t.VolumeM3 += t.Stops[i].VolumeM3
		}
		return TripDetail{Trip: t, PlanDate: date, Depot: depot, VehicleID: veh, VehicleType: typ, VehicleTemp: temp,
			WeightCapacityKg: capKg, VolumeCapacityM3: capM3}
	}
	items := []StopItem{{SKU: "MILK-CRT", Description: "Milk crate", Qty: 4}}
	return &Plan{
		FleetAvailable: map[string]int{"Peliyagoda": 38, "Kandy": 22},
		Trips: []TripDetail{
			trip("VEH003", "Peliyagoda", "truck", "reefer", 1, "Fresh", "Colombo", 5510, 26.4,
				Stop{Sequence: 1, OrderRef: "ORD-1", OutletID: "OUT004", Brand: "Fresh", Temperature: "chilled", WeightKg: 568, VolumeM3: 2.92, ETA: "03:54", WindowOpen: "05:30", WindowClose: "08:00", Items: items},
				Stop{Sequence: 2, OrderRef: "ORD-2", OutletID: "OUT008", Brand: "Fresh", Temperature: "chilled", WeightKg: 714, VolumeM3: 4, ETA: "04:18", WindowOpen: "05:00", WindowClose: "07:30", Items: items}),
			trip("VEH018", "Peliyagoda", "truck", "ambient", 1, "Style", "Gampaha", 4200, 24,
				Stop{Sequence: 1, OrderRef: "ORD-3", OutletID: "OUT035", Brand: "Style", Temperature: "ambient", WeightKg: 912, VolumeM3: 11.4, ETA: "08:37", WindowOpen: "10:30", WindowClose: "12:30", Items: items}),
			trip("VEH057", "Kandy", "van", "reefer", 1, "Fresh", "Kandy", 1040, 7,
				Stop{Sequence: 1, OrderRef: "ORD-4", OutletID: "OUT077", Brand: "Fresh", Temperature: "chilled", WeightKg: 104, VolumeM3: 0.55, ETA: "03:46", WindowOpen: "05:00", WindowClose: "07:30", Items: items}),
		},
		Deferrals: []DeferredOrder{
			{OrderRef: "ORD-5", OutletID: "OUT054", Depot: "Peliyagoda", District: "Galle", Brand: "Fresh", Temperature: "chilled",
				OrderDate: date, Reason: ReasonNoReeferAvailable, ReasonDetail: "All refrigerated vehicles at Peliyagoda are fully booked."},
			{OrderRef: "ORD-6", OutletID: "OUT070", Depot: "Peliyagoda", District: "Kurunegala", Brand: "Style", Temperature: "ambient",
				OrderDate: date, Reason: ReasonCapacityVolume, ReasonDetail: "40.66 m³ is larger than the largest suitable vehicle (38.00 m³)."},
		},
	}
}

type funcPlanner func(ctx context.Context, runID string, d time.Time) (*RunStats, error)

func (f funcPlanner) Plan(ctx context.Context, runID, _ string, d time.Time) (*RunStats, error) {
	return f(ctx, runID, d)
}

var noopPlanner = funcPlanner(func(context.Context, string, time.Time) (*RunStats, error) { return &RunStats{}, nil })

var fixedNow = func() time.Time { return time.Date(2026, 10, 2, 20, 0, 0, 0, time.UTC) } // 3 Oct 01:30 in Colombo

const testSecret = "planning-test-secret"

func newTestServer(store *memStore, p Planner) http.Handler {
	mux := http.NewServeMux()
	(&API{store: store, runs: NewRunManager(store, store, p, time.Minute), now: fixedNow, secret: testSecret,
		nextRunDate: func(context.Context) (time.Time, error) { return time.Date(2026, 10, 5, 0, 0, 0, 0, sriLanka), nil },
	}).routes(mux)
	return mux
}

// do calls the API as a service (role "system", allowed on every route); auth_test.go covers the roles.
func do(t *testing.T, h http.Handler, method, path, body string) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+serviceToken(testSecret, time.Now()))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return rec, out
}

func TestSummaryCoversBothDepots(t *testing.T) {
	store := newMemStore()
	store.seed("2026-10-03", samplePlan("2026-10-03"))
	rec, out := do(t, newTestServer(store, noopPlanner), "GET", "/schedule/summary", "")
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
	if totals["vehiclesUsed"].(float64) != 3 || totals["trips"].(float64) != 3 || totals["ordersDeferred"].(float64) != 2 ||
		totals["vehiclesAvailable"].(float64) != 60 || totals["ordersServed"].(float64) != 4 {
		t.Errorf("totals = %v", totals)
	}
}

func TestSummaryWithoutPlanIsEmpty(t *testing.T) {
	rec, out := do(t, newTestServer(newMemStore(), noopPlanner), "GET", "/schedule/summary?date=2026-10-09", "")
	if rec.Code != http.StatusOK || out["totals"].(map[string]any)["trips"].(float64) != 0 {
		t.Errorf("status %d body %v", rec.Code, out)
	}
}

func TestDepotSchedule(t *testing.T) {
	store := newMemStore()
	runID := store.seed("2026-10-05", samplePlan("2026-10-05"))
	h := newTestServer(store, noopPlanner)
	rec, out := do(t, h, "GET", "/depots/peliyagoda/schedule?date=2026-10-05", "")
	if rec.Code != http.StatusOK || out["depot"] != "Peliyagoda" || out["date"] != "2026-10-05" || out["planRunId"] != runID {
		t.Fatalf("status %d body %v", rec.Code, out)
	}
	if n := len(out["vehicles"].([]any)); n != 2 {
		t.Errorf("Peliyagoda vehicles = %d, want 2", n)
	}
	if rec, _ := do(t, h, "GET", "/depots/Galle/schedule", ""); rec.Code != http.StatusNotFound {
		t.Errorf("unknown depot: status %d, want 404", rec.Code)
	}
	if rec, _ := do(t, h, "GET", "/depots/Kandy/schedule?date=05-10-2026", ""); rec.Code != http.StatusBadRequest {
		t.Errorf("bad date: status %d, want 400", rec.Code)
	}
}

func TestDeferralsFilterByDepot(t *testing.T) {
	store := newMemStore()
	store.seed("2026-10-03", samplePlan("2026-10-03"))
	h := newTestServer(store, noopPlanner)
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

func TestTripsAreServedUnderBothPrefixes(t *testing.T) {
	store := newMemStore()
	store.seed("2026-10-05", samplePlan("2026-10-05"))
	h := newTestServer(store, noopPlanner)
	for _, path := range []string{"/trips/20261005-VEH003-T1", "/api/planning/trips/20261005-VEH003-T1"} {
		rec, trip := do(t, h, "GET", path, "")
		if rec.Code != http.StatusOK || trip["vehicleId"] != "VEH003" || trip["planDate"] != "2026-10-05" {
			t.Fatalf("%s: status %d body %v", path, rec.Code, trip)
		}
		stop := trip["stops"].([]any)[0].(map[string]any)
		if stop["stopId"] != "20261005-VEH003-T1-S1" || len(stop["items"].([]any)) != 1 {
			t.Errorf("%s: stop = %v", path, stop)
		}
	}
	if rec, _ := do(t, h, "GET", "/trips/20261005-VEH999-T1", ""); rec.Code != http.StatusNotFound {
		t.Errorf("unknown trip: status %d, want 404", rec.Code)
	}
	req := httptest.NewRequest("GET", "/trips?date=2026-10-05&depot=Peliyagoda", nil)
	req.Header.Set("Authorization", "Bearer "+serviceToken(testSecret, time.Now()))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var list []map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &list)
	if rec.Code != http.StatusOK || len(list) != 2 {
		t.Errorf("list: status %d, %d trips, want 2", rec.Code, len(list))
	}
}

func TestStartPlanningUsesNextRunDateAndRejectsDuplicates(t *testing.T) {
	release := make(chan struct{})
	defer close(release)
	blocking := funcPlanner(func(ctx context.Context, _ string, _ time.Time) (*RunStats, error) {
		select {
		case <-release:
		case <-ctx.Done():
		}
		return &RunStats{}, nil
	})
	h := newTestServer(newMemStore(), blocking)

	rec, run := do(t, h, "POST", "/planning-runs", "")
	if rec.Code != http.StatusAccepted || run["planDate"] != "2026-10-05" || run["trigger"] != "manual" {
		t.Fatalf("status %d body %v", rec.Code, run)
	}
	rec, dup := do(t, h, "POST", "/api/planning/planning-runs", `{"planDate":"2026-10-05"}`)
	if rec.Code != http.StatusConflict || dup["runId"] != run["runId"] {
		t.Errorf("duplicate: status %d body %v", rec.Code, dup)
	}
	if rec, _ := do(t, h, "POST", "/planning-runs", `{"planDate":"2026-10-01"}`); rec.Code != http.StatusBadRequest {
		t.Errorf("past date: status %d, want 400", rec.Code)
	}
	if rec, _ := do(t, h, "POST", "/planning-runs", `{bad json`); rec.Code != http.StatusBadRequest {
		t.Errorf("bad json: status %d, want 400", rec.Code)
	}
	if rec, got := do(t, h, "GET", "/planning-runs/"+run["runId"].(string), ""); rec.Code != http.StatusOK || got["planDate"] != "2026-10-05" {
		t.Errorf("get run: status %d body %v", rec.Code, got)
	}
}

func waitForRun(t *testing.T, m *RunManager, id string) PlanningRun {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if r, _, _ := m.Get(context.Background(), id); r.Status == RunCompleted || r.Status == RunFailed {
			return r
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("run did not finish")
	return PlanningRun{}
}

func TestFailedRunDiscardsPlanAndAllowsRetry(t *testing.T) {
	store := newMemStore()
	fail := true
	p := funcPlanner(func(ctx context.Context, runID string, _ time.Time) (*RunStats, error) {
		_ = store.SavePlan(ctx, runID, time.Time{}, samplePlan("2026-10-04"))
		if fail {
			return nil, errors.New("status batch rejected")
		}
		return &RunStats{Served: 4}, nil
	})
	m := NewRunManager(store, store, p, time.Minute)
	day := time.Date(2026, 10, 4, 0, 0, 0, 0, sriLanka)

	run, _, _ := m.Start(context.Background(), day, "cron")
	if r := waitForRun(t, m, run.RunID); r.Status != RunFailed || r.Error == "" {
		t.Fatalf("run = %+v, want FAILED with an error", r)
	}
	if _, ok := store.plans[run.RunID]; ok {
		t.Error("a failed run's plan must be discarded")
	}
	fail = false
	again, started, _ := m.Start(context.Background(), day, "cron")
	if !started {
		t.Fatal("a new run should be allowed once the previous one failed")
	}
	if r := waitForRun(t, m, again.RunID); r.Status != RunCompleted || r.Stats == nil || r.Stats.Served != 4 {
		t.Errorf("retry = %+v", r)
	}
	if _, started, _ := m.Start(context.Background(), day, "cron"); started {
		t.Error("a completed date must not be planned again")
	}
}

func TestOnlyCompletedRunsWakeTheScheduler(t *testing.T) {
	store := newMemStore()
	fail := true
	p := funcPlanner(func(context.Context, string, time.Time) (*RunStats, error) {
		if fail {
			return nil, errors.New("fleet-directory unreachable")
		}
		return &RunStats{}, nil
	})
	m := NewRunManager(store, store, p, time.Minute)
	run, _, _ := m.Start(context.Background(), time.Date(2026, 10, 4, 0, 0, 0, 0, sriLanka), "catchup")
	waitForRun(t, m, run.RunID)
	select {
	case <-m.Done():
		t.Fatal("a failed run must not wake the scheduler (it would retry immediately)")
	case <-time.After(50 * time.Millisecond):
	}
	fail = false
	run, _, _ = m.Start(context.Background(), time.Date(2026, 10, 4, 0, 0, 0, 0, sriLanka), "catchup")
	waitForRun(t, m, run.RunID)
	select {
	case <-m.Done():
	case <-time.After(time.Second):
		t.Fatal("a completed run must wake the scheduler")
	}
}
