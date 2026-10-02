package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log"
	"sync"
	"time"
)

// Planner builds and stores the schedule for one day. The stub does nothing; the real implementation
// loads the day's orders and available fleet, runs the optimiser (ALNS) and writes the schedule and
// deferrals that ScheduleStore reads.
type Planner interface {
	Plan(ctx context.Context, planDate time.Time) error
}

type stubPlanner struct{}

func (stubPlanner) Plan(ctx context.Context, planDate time.Time) error {
	log.Printf("[%s] stub planner: would plan %s", serviceName, planDate.Format(dateLayout))
	return nil
}

// RunManager tracks planning runs in memory. One run per plan date can be active at a time.
type RunManager struct {
	mu      sync.Mutex
	planner Planner
	timeout time.Duration
	runs    map[string]*PlanningRun
	active  map[string]string // planDate -> runId of the queued/running run
	now     func() time.Time
}

func NewRunManager(p Planner, timeout time.Duration) *RunManager {
	return &RunManager{planner: p, timeout: timeout, runs: map[string]*PlanningRun{},
		active: map[string]string{}, now: time.Now}
}

// Start queues a run for planDate. If one is already queued or running for that date it is
// returned with started == false.
func (m *RunManager) Start(planDate time.Time, trigger string) (PlanningRun, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	day := planDate.Format(dateLayout)
	if id, ok := m.active[day]; ok {
		return *m.runs[id], false
	}
	run := &PlanningRun{RunID: newRunID(), PlanDate: day, Status: RunQueued, Trigger: trigger,
		RequestedAt: m.now().UTC().Format(time.RFC3339)}
	m.runs[run.RunID] = run
	m.active[day] = run.RunID
	go m.execute(run.RunID, planDate)
	return *run, true
}

func (m *RunManager) Get(id string) (PlanningRun, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	r, ok := m.runs[id]
	if !ok {
		return PlanningRun{}, false
	}
	return *r, true
}

func (m *RunManager) execute(id string, planDate time.Time) {
	m.update(id, func(r *PlanningRun) {
		r.Status = RunRunning
		r.StartedAt = m.now().UTC().Format(time.RFC3339)
	})
	ctx, cancel := context.WithTimeout(context.Background(), m.timeout)
	defer cancel()
	err := m.planner.Plan(ctx, planDate)
	m.update(id, func(r *PlanningRun) {
		r.FinishedAt = m.now().UTC().Format(time.RFC3339)
		if err != nil {
			r.Status, r.Error = RunFailed, err.Error()
		} else {
			r.Status = RunCompleted
		}
		delete(m.active, r.PlanDate)
	})
	if err != nil {
		log.Printf("[%s] planning run %s for %s failed: %v", serviceName, id, planDate.Format(dateLayout), err)
	}
}

func (m *RunManager) update(id string, f func(*PlanningRun)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	f(m.runs[id])
}

func newRunID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return "run_" + hex.EncodeToString(b)
}
