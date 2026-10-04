package main

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestSchedulerPlansOnceFromTriggerHour(t *testing.T) {
	store := newMemStore()
	planned := make(chan string, 4)
	p := funcPlanner(func(_ context.Context, _ string, d time.Time) (*RunStats, error) {
		planned <- d.Format(dateLayout)
		return &RunStats{}, nil
	})
	orders := &fakeOrders{}
	clock := time.Date(2026, 10, 4, 15, 59, 0, 0, sriLanka)
	s := &Scheduler{orders: closeWindowAs{orders, "2026-10-05"}, runs: NewRunManager(store, store, p, time.Minute),
		store: store, triggerHour: 16, maxAttempts: 3, now: func() time.Time { return clock }}

	s.tick(context.Background())
	if len(orders.closed) != 0 {
		t.Fatal("must not close the window or plan before the trigger hour")
	}
	clock = clock.Add(2 * time.Minute)
	s.tick(context.Background())
	if got := <-planned; got != "2026-10-05" {
		t.Fatalf("planned %s, want 2026-10-05", got)
	}
	runs, _ := store.ListRuns(context.Background(), "2026-10-05")
	waitForRun(t, s.runs, runs[0].RunID)
	s.tick(context.Background()) // sees the completed run and stops for the day
	s.tick(context.Background())
	if s.doneDay != "2026-10-04" || len(planned) != 0 {
		t.Errorf("doneDay = %q, extra runs = %d", s.doneDay, len(planned))
	}
}

func TestSchedulerStopsAfterMaxAttempts(t *testing.T) {
	store := newMemStore()
	for n := 0; n < 3; n++ {
		id := newRunID()
		store.runs[id] = PlanningRun{RunID: id, PlanDate: "2026-10-05", Status: RunFailed, Trigger: "cron"}
	}
	s := &Scheduler{orders: closeWindowAs{&fakeOrders{}, "2026-10-05"}, store: store, triggerHour: 16, maxAttempts: 3,
		runs: NewRunManager(store, store, noopPlanner, time.Minute),
		now:  func() time.Time { return time.Date(2026, 10, 4, 17, 0, 0, 0, sriLanka) }}
	s.tick(context.Background())
	if b, _ := store.BlockingRun(context.Background(), "2026-10-05"); b != nil || s.doneDay != "2026-10-04" {
		t.Errorf("started a 4th attempt (%v) or did not stop for the day (%q)", b, s.doneDay)
	}
}

// closeWindowAs answers CloseWindow("") with a fixed next run date, like Order Management does.
type closeWindowAs struct {
	*fakeOrders
	date string
}

func (c closeWindowAs) CloseWindow(ctx context.Context, date string) (string, error) {
	if date == "" {
		date = c.date
	}
	return c.fakeOrders.CloseWindow(ctx, date)
}

// poolsByDate serves a different confirmed pool size per date.
type poolsByDate struct {
	*fakeOrders
	sizes map[string]int
}

func (p poolsByDate) Confirmed(_ context.Context, date string) ([]ConfirmedOrder, error) {
	return make([]ConfirmedOrder, p.sizes[date]), nil
}

func TestCatchUpPlansPastDaysOldestFirstOneAtATime(t *testing.T) {
	store := newMemStore()
	release := make(chan struct{})
	var mu sync.Mutex
	var planned []string
	p := funcPlanner(func(_ context.Context, _ string, d time.Time) (*RunStats, error) {
		mu.Lock()
		planned = append(planned, d.Format(dateLayout))
		mu.Unlock()
		<-release
		return &RunStats{}, nil
	})
	orders := poolsByDate{&fakeOrders{}, map[string]int{"2026-10-01": 130, "2026-10-02": 140, "2026-10-03": 150}}
	s := &Scheduler{orders: orders, runs: NewRunManager(store, store, p, time.Minute), store: store, plans: store,
		triggerHour: 16, catchupDays: 7, maxAttempts: 3,
		now: func() time.Time { return time.Date(2026, 10, 4, 17, 0, 0, 0, sriLanka) }} // Sunday, after 16:00

	for n, want := range []string{"2026-10-01", "2026-10-02", "2026-10-03"} {
		s.tick(context.Background())
		// Every earlier past day is delivered before this one is planned.
		if got := strings.Join(orders.delivered, ","); got != strings.Join([]string{"2026-10-01", "2026-10-02"}[:n], ",") {
			t.Fatalf("before planning %s, delivered days = %q", want, got)
		}
		s.tick(context.Background()) // busy: must not start a second run
		runs, _ := store.ListRuns(context.Background(), want)
		if len(runs) != 1 || runs[0].Trigger != "catchup" {
			t.Fatalf("%s: runs = %+v", want, runs)
		}
		release <- struct{}{}
		waitForRun(t, s.runs, runs[0].RunID)
		for s.runs.Busy() {
			time.Sleep(time.Millisecond)
		}
	}
	mu.Lock()
	got := strings.Join(planned, ",")
	mu.Unlock()
	if got != "2026-10-01,2026-10-02,2026-10-03" {
		t.Errorf("planned %s, want the three past days oldest first", got)
	}
	if len(orders.closed) != 0 {
		t.Error("the nightly run must wait until catch-up has nothing left")
	}
	// Catch-up done: the next tick moves on to the nightly run for the next date.
	go func() { release <- struct{}{} }()
	s.tick(context.Background())
	if len(orders.closed) != 1 {
		t.Errorf("nightly cutoff calls = %v, want one after catch-up", orders.closed)
	}
	if got := strings.Join(orders.delivered, ","); got != "2026-10-01,2026-10-02,2026-10-03" {
		t.Errorf("delivered days = %q, want all three past days once", got)
	}
}

func TestCatchUpLeavesTodayAllocated(t *testing.T) {
	store := newMemStore()
	store.seed("2026-10-05", samplePlan("2026-10-05"))
	orders := poolsByDate{&fakeOrders{}, map[string]int{}}
	s := &Scheduler{orders: orders, runs: NewRunManager(store, store, noopPlanner, time.Minute), store: store, plans: store,
		triggerHour: 16, catchupDays: 3, maxAttempts: 3,
		now: func() time.Time { return time.Date(2026, 10, 5, 9, 0, 0, 0, sriLanka) }}
	s.tick(context.Background())
	if len(orders.delivered) != 0 {
		t.Errorf("today's plan must stay allocated; delivered %v", orders.delivered)
	}
}

func TestSchedulerWaitsForDependencies(t *testing.T) {
	store := newMemStore()
	orders := poolsByDate{&fakeOrders{}, map[string]int{"2026-10-03": 150}}
	fleetUp := false
	s := &Scheduler{orders: orders, runs: NewRunManager(store, store, noopPlanner, time.Minute), store: store, plans: store,
		deps: []func(context.Context) error{func(context.Context) error {
			if !fleetUp {
				return errors.New("fleet-directory unreachable")
			}
			return nil
		}},
		triggerHour: 16, catchupDays: 3, maxAttempts: 3,
		now: func() time.Time { return time.Date(2026, 10, 4, 17, 0, 0, 0, sriLanka) }}
	s.tick(context.Background())
	if runs, _ := store.ListRuns(context.Background(), "2026-10-03"); len(runs) != 0 {
		t.Fatalf("started %d run(s) while fleet was down", len(runs))
	}
	fleetUp = true
	s.tick(context.Background())
	if runs, _ := store.ListRuns(context.Background(), "2026-10-03"); len(runs) != 1 {
		t.Fatalf("runs once fleet is up = %d, want 1", len(runs))
	}
}
