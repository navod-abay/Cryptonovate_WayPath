package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"time"
)

// Scheduler starts planning runs, one at a time.
//
// Catch-up: any day from catchupDays ago up to today that has confirmed orders but no completed plan
// is planned first, oldest first. Each run defers what it cannot serve to the next operating day, so
// planning the days in order is what lets those orders roll forward. This plans the seeded past days
// and today when the stack starts, and any day missed while the service was down.
//
// Demo history: a planned day that is already in the past is then marked delivered and received in
// Order Management (with the plan's times) before the next day is planned, so the next cutoff sweep
// sees who was served. Order Management only allows this with demo data on.
//
// Nightly: from triggerHour (Colombo) each day it asks Order Management to close the next run date
// (the same idempotent cutoff sweep as its own 16:00 timer, which also tells Planning which date
// that is) and plans it once.
//
// A failed run is retried on later ticks, up to maxAttempts per date and trigger; after that the
// date needs a manual POST /planning-runs (service token, role "system").
type Scheduler struct {
	orders      OrdersAPI
	deps        []func(context.Context) error // health checks of the services a run needs
	runs        *RunManager
	store       RunStore
	plans       ScheduleStore
	triggerHour int
	catchupDays int // how many days back (including today) catch-up looks
	interval    time.Duration
	maxAttempts int
	now         func() time.Time
	doneDay     string          // Colombo day whose run is finished (completed or out of attempts)
	historyDone map[string]bool // past days already marked delivered in this process
	historyOff  bool            // Order Management refused: demo data is disabled
	waiting     string          // last "not ready" reason logged, to avoid repeating it every tick
}

func (s *Scheduler) Run(ctx context.Context) {
	log.Printf("[%s] planning scheduler started (from %02d:00 Colombo, every %s, %d attempts per date)",
		serviceName, s.triggerHour, s.interval, s.maxAttempts)
	t := time.NewTicker(s.interval)
	defer t.Stop()
	for {
		s.tick(ctx)
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		case <-s.runs.Done(): // a run completed: catch-up can move on to the next day straight away
		}
	}
}

func (s *Scheduler) tick(ctx context.Context) {
	if s.runs.Busy() || !s.ready(ctx) || s.catchUp(ctx) {
		return
	}
	now := s.now().In(sriLanka)
	today := now.Format(dateLayout)
	if now.Hour() < s.triggerHour || s.doneDay == today {
		return
	}
	day, err := s.orders.CloseWindow(ctx, "")
	if err != nil {
		log.Printf("[%s] scheduler: cutoff sweep failed, will retry: %v", serviceName, err)
		return
	}
	planDate, err := time.ParseInLocation(dateLayout, day, sriLanka)
	if err != nil {
		log.Printf("[%s] scheduler: order-management returned run date %q: %v", serviceName, day, err)
		return
	}
	existing, err := s.store.BlockingRun(ctx, day)
	if err != nil {
		log.Printf("[%s] scheduler: %v", serviceName, err)
		return
	}
	if existing != nil {
		if existing.Status == RunCompleted {
			s.doneDay = today
		}
		return
	}
	failed, err := s.store.CountFailedRuns(ctx, day, "cron")
	if err != nil {
		log.Printf("[%s] scheduler: %v", serviceName, err)
		return
	}
	if failed >= s.maxAttempts {
		log.Printf("[%s] scheduler: %s failed %d times; not retrying (start it with POST /planning-runs and a service token)", serviceName, day, failed)
		s.doneDay = today
		return
	}
	run, started, err := s.runs.Start(ctx, planDate, "cron")
	if err != nil {
		log.Printf("[%s] scheduler: start run for %s: %v", serviceName, day, err)
		return
	}
	if started {
		log.Printf("[%s] scheduler: started %s for %s (attempt %d)", serviceName, run.RunID, day, failed+1)
	}
}

// catchUp starts a run for the oldest unplanned day (up to today) that has confirmed orders. It
// returns true when it started a run or must wait for one, so the nightly run never overtakes it.
func (s *Scheduler) catchUp(ctx context.Context) bool {
	y, m, d := s.now().In(sriLanka).Date()
	today := time.Date(y, m, d, 0, 0, 0, 0, sriLanka)
	for back := s.catchupDays - 1; back >= 0; back-- {
		date := today.AddDate(0, 0, -back)
		day := date.Format(dateLayout)
		existing, err := s.store.BlockingRun(ctx, day)
		if err != nil {
			log.Printf("[%s] catch-up: %v", serviceName, err)
			return true
		}
		if existing != nil {
			if existing.Status != RunCompleted {
				return true // queued or running elsewhere
			}
			if back > 0 && !s.recordHistory(ctx, date) {
				return true // retry before planning the next day
			}
			continue
		}
		if failed, err := s.store.CountFailedRuns(ctx, day, "catchup"); err != nil || failed >= s.maxAttempts {
			continue
		}
		pool, err := s.orders.Confirmed(ctx, day)
		if err != nil {
			log.Printf("[%s] catch-up: read confirmed orders for %s, will retry: %v", serviceName, day, err)
			return true
		}
		if len(pool) == 0 {
			continue
		}
		run, started, err := s.runs.Start(ctx, date, "catchup")
		if err != nil {
			log.Printf("[%s] catch-up: start run for %s: %v", serviceName, day, err)
			return true
		}
		if started {
			log.Printf("[%s] catch-up: started %s for %s (%d confirmed orders)", serviceName, run.RunID, day, len(pool))
		}
		return true
	}
	return false
}

// recordHistory marks a completed past day delivered and received, once per process. It returns
// false when the call failed and should be retried.
func (s *Scheduler) recordHistory(ctx context.Context, date time.Time) bool {
	day := date.Format(dateLayout)
	if s.historyOff || s.historyDone[day] {
		return true
	}
	trips, err := s.plans.Trips(ctx, date, TripFilter{})
	if err != nil {
		log.Printf("[%s] history: load plan for %s: %v", serviceName, day, err)
		return false
	}
	var deliveries []PlannedDelivery
	for _, t := range trips {
		for _, st := range t.Stops {
			deliveries = append(deliveries, PlannedDelivery{OrderRef: st.OrderRef, DepartureTime: t.DepartureTime, ArrivalTime: st.ETA})
		}
	}
	n, err := s.orders.SimulateDelivery(ctx, day, deliveries)
	var apiErr *apiError
	if errors.As(err, &apiErr) && apiErr.Status == http.StatusForbidden {
		log.Printf("[%s] history: order-management does not mark past days delivered (demo data off); skipping", serviceName)
		s.historyOff = true
		return true
	}
	if err != nil {
		log.Printf("[%s] history: mark %s delivered, will retry: %v", serviceName, day, err)
		return false
	}
	if s.historyDone == nil {
		s.historyDone = map[string]bool{}
	}
	s.historyDone[day] = true
	if n > 0 {
		log.Printf("[%s] history: %s marked delivered and received (%d orders)", serviceName, day, n)
	}
	return true
}

// ready checks that Order Management and Fleet answer before anything is started, so a dependency
// that is still starting (or restarting) does not use up a date's attempts.
func (s *Scheduler) ready(ctx context.Context) bool {
	for _, check := range s.deps {
		if err := check(ctx); err != nil {
			if msg := err.Error(); msg != s.waiting {
				log.Printf("[%s] scheduler: waiting for dependencies: %s", serviceName, msg)
				s.waiting = msg
			}
			return false
		}
	}
	if s.waiting != "" {
		log.Printf("[%s] scheduler: dependencies ready", serviceName)
		s.waiting = ""
	}
	return true
}
