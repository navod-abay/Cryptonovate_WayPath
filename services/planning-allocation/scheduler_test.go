package main

import (
	"context"
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
