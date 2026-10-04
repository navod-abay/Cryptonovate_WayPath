package main

import (
	"context"
	"log"
	"time"
)

// Scheduler starts the nightly planning run. From triggerHour (Colombo) each day it asks Order
// Management to close the next run date (the same idempotent cutoff sweep as its own 16:00 timer,
// which also tells Planning which date that is) and plans it once. A failed run is retried on later
// ticks, up to maxAttempts per date; after that the date needs a manual POST /planning-runs.
type Scheduler struct {
	orders      OrdersAPI
	runs        *RunManager
	store       RunStore
	triggerHour int
	interval    time.Duration
	maxAttempts int
	now         func() time.Time
	doneDay     string // Colombo day whose run is finished (completed or out of attempts)
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
		}
	}
}

func (s *Scheduler) tick(ctx context.Context) {
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
		log.Printf("[%s] scheduler: %s failed %d times; not retrying (start it with POST /planning-runs)", serviceName, day, failed)
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
