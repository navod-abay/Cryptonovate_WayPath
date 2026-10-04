package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log"
	"sync"
	"time"
)

// RunStore persists planning runs. A plan date has at most one run that is queued, running or
// completed (the "blocking" run); failed runs are kept for the record.
type RunStore interface {
	// CreateRun inserts run unless the date already has a blocking run, which is returned instead
	// with created == false.
	CreateRun(ctx context.Context, run PlanningRun) (existing PlanningRun, created bool, err error)
	UpdateRun(ctx context.Context, run PlanningRun) error
	GetRun(ctx context.Context, id string) (PlanningRun, bool, error)
	ListRuns(ctx context.Context, planDate string) ([]PlanningRun, error)
	BlockingRun(ctx context.Context, planDate string) (*PlanningRun, error)
	CountFailedRuns(ctx context.Context, planDate, trigger string) (int, error)
	// FailInterruptedRuns marks runs left queued/running by a restart as failed and discards their plans.
	FailInterruptedRuns(ctx context.Context) (int, error)
}

// RunManager starts planning runs and records their outcome.
type RunManager struct {
	mu      sync.Mutex
	store   RunStore
	plans   PlanWriter
	planner Planner
	timeout time.Duration
	now     func() time.Time
	active  int           // runs queued or running in this process
	done    chan struct{} // signalled (without blocking) whenever a run completes
}

func NewRunManager(store RunStore, plans PlanWriter, p Planner, timeout time.Duration) *RunManager {
	return &RunManager{store: store, plans: plans, planner: p, timeout: timeout, now: time.Now, done: make(chan struct{}, 1)}
}

// Done fires after a run completes, so the scheduler can start the next one without waiting a tick.
// Failed runs do not fire it: a retry waits for the next tick instead of burning attempts at once.
func (m *RunManager) Done() <-chan struct{} { return m.done }

// Start queues a run for planDate. If the date already has a queued, running or completed run, that
// run is returned with started == false.
func (m *RunManager) Start(ctx context.Context, planDate time.Time, trigger string) (PlanningRun, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	run := PlanningRun{RunID: newRunID(), PlanDate: planDate.Format(dateLayout), Status: RunQueued, Trigger: trigger,
		RequestedAt: m.now().UTC().Format(time.RFC3339)}
	existing, created, err := m.store.CreateRun(ctx, run)
	if err != nil || !created {
		return existing, false, err
	}
	m.active++
	go m.execute(run, planDate)
	return run, true, nil
}

// Busy reports whether this process has a run queued or running.
func (m *RunManager) Busy() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.active > 0
}

func (m *RunManager) Get(ctx context.Context, id string) (PlanningRun, bool, error) {
	return m.store.GetRun(ctx, id)
}

func (m *RunManager) execute(run PlanningRun, planDate time.Time) {
	completed := false
	defer func() {
		m.mu.Lock()
		m.active--
		m.mu.Unlock()
		if completed {
			select {
			case m.done <- struct{}{}:
			default:
			}
		}
	}()
	bg := context.Background()
	run.Status, run.StartedAt = RunRunning, m.now().UTC().Format(time.RFC3339)
	if err := m.store.UpdateRun(bg, run); err != nil {
		log.Printf("[%s] run %s: record start: %v", serviceName, run.RunID, err)
	}
	ctx, cancel := context.WithTimeout(bg, m.timeout)
	defer cancel()
	stats, err := m.planner.Plan(ctx, run.RunID, run.Trigger, planDate)
	run.FinishedAt = m.now().UTC().Format(time.RFC3339)
	if err != nil {
		if derr := m.plans.DiscardPlan(bg, run.RunID); derr != nil {
			log.Printf("[%s] run %s: discard plan: %v", serviceName, run.RunID, derr)
		}
		run.Status, run.Error = RunFailed, err.Error()
		log.Printf("[%s] planning run %s for %s failed: %v", serviceName, run.RunID, run.PlanDate, err)
	} else {
		run.Status, run.Stats = RunCompleted, stats
		completed = true
	}
	if err := m.store.UpdateRun(bg, run); err != nil {
		log.Printf("[%s] run %s: record outcome: %v", serviceName, run.RunID, err)
	}
}

func newRunID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return "run_" + hex.EncodeToString(b)
}
