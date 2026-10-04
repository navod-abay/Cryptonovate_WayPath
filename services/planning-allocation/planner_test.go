package main

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"
)

type fakeOrders struct {
	pool      []ConfirmedOrder
	closed    []string
	batches   [][]StatusUpdate
	batchErr  error
	delivered []string // dates passed to SimulateDelivery
}

func (f *fakeOrders) CloseWindow(_ context.Context, date string) (string, error) {
	f.closed = append(f.closed, date)
	return date, nil
}
func (f *fakeOrders) Confirmed(context.Context, string) ([]ConfirmedOrder, error) { return f.pool, nil }
func (f *fakeOrders) Items(_ context.Context, ref string) ([]OrderItem, error) {
	return []OrderItem{{SKU: "SKU-" + ref, Description: "line", Quantity: 3}}, nil
}
func (f *fakeOrders) SimulateDelivery(_ context.Context, date string, d []PlannedDelivery) (int, error) {
	f.delivered = append(f.delivered, date)
	return len(d), nil
}
func (f *fakeOrders) StatusBatch(_ context.Context, u []StatusUpdate) error {
	if f.batchErr != nil {
		return f.batchErr
	}
	f.batches = append(f.batches, u)
	return nil
}

type fakeFleet struct {
	vehicles []FleetVehicle
	metrics  TravelMetrics
}

func (f *fakeFleet) AvailableVehicles(context.Context, string) ([]FleetVehicle, error) {
	return f.vehicles, nil
}
func (f *fakeFleet) FuelUsage(context.Context, int, int) ([]FleetFuelUsage, error) { return nil, nil }
func (f *fakeFleet) TravelMetrics(context.Context) (TravelMetrics, error)          { return f.metrics, nil }

// task2bAPIs serves the Task 2B S1 data the way Order Management and Fleet return it.
func task2bAPIs(t *testing.T) (*fakeOrders, *fakeFleet) {
	orders := &fakeOrders{}
	for _, r := range readCSV(t, "Test Data/task2b_peak_day_scenarios.csv") {
		if r["scenario"] != "S1" {
			continue
		}
		orders.pool = append(orders.pool, ConfirmedOrder{OrderRef: r["order_ref"], OutletID: r["outlet_id"], Brand: r["brand"],
			Depot: r["depot"], District: r["district"], TempRequirement: r["temp_requirement"],
			OrderWeightKg: num(t, r["order_weight_kg"]), OrderVolumeM3: num(t, r["order_volume_m3"]),
			WindowOpenTime: r["window_open_time"], WindowCloseTime: r["window_close_time"], DockType: r["dock_type"],
			ParkingConstraint: r["parking_constraint"], DeferredYesterday: r["deferred_yesterday"] == "1",
			DaysSinceServed: int(num(t, r["days_since_last_served"])), OriginalOrderDate: "2026-10-05"})
	}
	fleet := &fakeFleet{}
	status := map[string]string{}
	for _, r := range readCSV(t, "Test Data/task2b_peak_day_fleet.csv") {
		if r["scenario"] == "S1" {
			status[r["vehicle_id"]] = r["status"]
		}
	}
	for _, r := range readCSV(t, "General Data/vehicles.csv") {
		if status[r["vehicle_id"]] == "available" {
			fleet.vehicles = append(fleet.vehicles, FleetVehicle{VehicleID: r["vehicle_id"], Type: r["type"], Temp: r["temp"],
				WeightCapKg: num(t, r["weight_cap_kg"]), VolumeCapM3: num(t, r["volume_cap_m3"]), KmPerL: num(t, r["km_per_l"]),
				Depot: r["depot"], WeeklyRangeKm: num(t, r["weekly_range_km"]), Status: "available"})
		}
	}
	for _, r := range readCSV(t, "General Data/district_travel.csv") {
		fleet.metrics.DistrictTravel = append(fleet.metrics.DistrictTravel, struct {
			District                   string  `json:"district"`
			Depot                      string  `json:"depot"`
			DepotToDistrictKm          float64 `json:"depot_to_district_km"`
			DepotToDistrictFreeflowMin float64 `json:"depot_to_district_freeflow_min"`
			InterStopKm                float64 `json:"inter_stop_km"`
			InterStopFreeflowMin       float64 `json:"inter_stop_freeflow_min"`
		}{r["district"], r["depot"], num(t, r["depot_to_district_km"]), num(t, r["depot_to_district_freeflow_min"]),
			num(t, r["inter_stop_km"]), num(t, r["inter_stop_freeflow_min"])})
	}
	for _, r := range readCSV(t, "General Data/service_allowance.csv") {
		fleet.metrics.ServiceAllowances = append(fleet.metrics.ServiceAllowances, struct {
			Brand      string  `json:"brand"`
			DockType   string  `json:"dock_type"`
			AllowanceM float64 `json:"service_allowance_min"`
		}{r["brand"], r["dock_type"], num(t, r["service_allowance_min"])})
	}
	return orders, fleet
}

var orderManagementReasonCodes = map[DeferralReason]bool{
	ReasonCapacityWeight: true, ReasonCapacityVolume: true, ReasonNoReeferAvailable: true, ReasonNoVanForVanOnly: true,
	ReasonTimeBudgetExceeded: true, ReasonFuelQuotaExceeded: true, ReasonVehicleUnavailable: true,
}

func TestPlannerPublishesTask2BPlan(t *testing.T) {
	if testing.Short() {
		t.Skip("runs ALNS3")
	}
	orders, fleet := task2bAPIs(t)
	store := newMemStore()
	params := DefaultALNSParams()
	params.Iterations = 500
	p := &ALNSPlanner{orders: orders, fleet: fleet, store: store, params: params, seeds: 2}
	day := time.Date(2026, 10, 5, 0, 0, 0, 0, sriLanka)

	stats, err := p.Plan(context.Background(), "run_test", "manual", day)
	if err != nil {
		t.Fatal(err)
	}
	if len(orders.closed) != 1 || orders.closed[0] != "2026-10-05" {
		t.Errorf("cutoff sweep calls = %v, want [2026-10-05]", orders.closed)
	}
	plan := store.plans["run_test"]
	if plan == nil {
		t.Fatal("plan was not stored")
	}
	if stats.Served+stats.Deferred != 85 || stats.Served < 70 {
		t.Errorf("stats = %+v", stats)
	}

	// Every confirmed order is written back exactly once: allocated with vehicle + trip 1|2, or deferred
	// with an Order Management reason code.
	seen := map[string]bool{}
	for _, batch := range orders.batches {
		for _, u := range batch {
			if seen[u.OrderRef] {
				t.Errorf("%s written back twice", u.OrderRef)
			}
			seen[u.OrderRef] = true
			switch u.Status {
			case "allocated":
				if u.VehicleID == "" || (u.TripID != 1 && u.TripID != 2) {
					t.Errorf("bad allocation %+v", u)
				}
			case "deferred":
				if !orderManagementReasonCodes[DeferralReason(u.ReasonCode)] || u.ReasonNote == "" {
					t.Errorf("bad deferral %+v", u)
				}
			default:
				t.Errorf("unexpected status %+v", u)
			}
		}
	}
	if len(seen) != 85 {
		t.Errorf("wrote back %d orders, want 85", len(seen))
	}
	for _, trip := range plan.Trips {
		if !strings.HasPrefix(trip.TripID, "20261005-"+trip.VehicleID+"-T") {
			t.Errorf("trip id %s", trip.TripID)
		}
		for _, s := range trip.Stops {
			if s.StopID == "" || s.ETA == "" || len(s.Items) != 1 {
				t.Errorf("stop %+v", s)
			}
		}
	}
	if plan.FleetAvailable["Peliyagoda"]+plan.FleetAvailable["Kandy"] != len(fleet.vehicles) {
		t.Errorf("fleet available = %v", plan.FleetAvailable)
	}
}

func TestPlannerFailsWhenWriteBackIsRejected(t *testing.T) {
	orders, fleet := task2bAPIs(t)
	orders.batchErr = errors.New("ORDER_NOT_FOUND")
	params := DefaultALNSParams()
	params.Iterations = 20
	p := &ALNSPlanner{orders: orders, fleet: fleet, store: newMemStore(), params: params, seeds: 1}
	if _, err := p.Plan(context.Background(), "run_x", "manual", time.Date(2026, 10, 5, 0, 0, 0, 0, sriLanka)); err == nil {
		t.Fatal("a rejected status batch must fail the run")
	}
}

func TestPlannerRejectsOrdersWithoutTravelData(t *testing.T) {
	orders, fleet := task2bAPIs(t)
	orders.pool[0].District = "Atlantis"
	p := &ALNSPlanner{orders: orders, fleet: fleet, store: newMemStore(), params: DefaultALNSParams(), seeds: 1}
	_, err := p.Plan(context.Background(), "run_y", "manual", time.Date(2026, 10, 5, 0, 0, 0, 0, sriLanka))
	if err == nil || !strings.Contains(err.Error(), "Atlantis") {
		t.Fatalf("err = %v, want missing travel metrics for Atlantis", err)
	}
}

func TestCatchUpRunsUseFewerSeeds(t *testing.T) {
	orders, fleet := task2bAPIs(t)
	params := DefaultALNSParams()
	params.Iterations = 20
	p := &ALNSPlanner{orders: orders, fleet: fleet, store: newMemStore(), params: params, seeds: 5, catchupSeeds: 1}
	day := time.Date(2026, 10, 5, 0, 0, 0, 0, sriLanka)
	for trigger, want := range map[string]int{"catchup": 1, "cron": 5, "manual": 5} {
		orders.batches = nil
		stats, err := p.Plan(context.Background(), "run_"+trigger, trigger, day)
		if err != nil {
			t.Fatal(err)
		}
		if stats.Seeds != want {
			t.Errorf("%s run used %d seed(s), want %d", trigger, stats.Seeds, want)
		}
	}
}

// seededCSV writes a stored plan the way scripts/export-seed-plans.sh does.
func seededCSV(day string, plan *Plan) string {
	var b strings.Builder
	b.WriteString("day,vehicle_id,trip_number,sequence,outlet_id,temperature,weight_kg,volume_m3\n")
	for _, t := range plan.Trips {
		for _, s := range t.Stops {
			fmt.Fprintf(&b, "%s,%s,%d,%d,%s,%s,%g,%g\n", day, t.VehicleID, t.TripNumber, s.Sequence, s.OutletID, s.Temperature, s.WeightKg, s.VolumeM3)
		}
	}
	for _, d := range plan.Deferrals {
		fmt.Fprintf(&b, "%s,,,,%s,%s,%g,%g\n", day, d.OutletID, d.Temperature, d.WeightKg, d.VolumeM3)
	}
	return b.String()
}

func TestCatchUpReplaysSeededPlan(t *testing.T) {
	orders, fleet := task2bAPIs(t)
	params := DefaultALNSParams()
	params.Iterations = 50
	day := time.Date(2026, 10, 5, 0, 0, 0, 0, sriLanka)
	solved := newMemStore()
	p := &ALNSPlanner{orders: orders, fleet: fleet, store: solved, params: params, seeds: 1}
	if _, err := p.Plan(context.Background(), "run_solved", "manual", day); err != nil {
		t.Fatal(err)
	}
	want := solved.plans["run_solved"]
	seeded, err := parseSeededPlans(seededCSV("7", want))
	if err != nil {
		t.Fatal(err)
	}

	replay := func(trigger string) (*RunStats, *Plan) {
		store := newMemStore()
		p := &ALNSPlanner{orders: orders, fleet: fleet, store: store, params: params, seeds: 1, catchupSeeds: 1, seeded: seeded}
		stats, err := p.Plan(context.Background(), "run_r", trigger, day)
		if err != nil {
			t.Fatal(err)
		}
		return stats, store.plans["run_r"]
	}
	stats, got := replay("catchup")
	if stats.Seeds != 0 {
		t.Errorf("catch-up solved (%d seeds) instead of replaying the seeded plan", stats.Seeds)
	}
	for n := range got.Trips {
		got.Trips[n].PlanRunID = want.Trips[n].PlanRunID
	}
	if fmt.Sprint(got.Trips) != fmt.Sprint(want.Trips) || fmt.Sprint(got.Deferrals) != fmt.Sprint(want.Deferrals) {
		t.Error("replayed plan differs from the stored one")
	}
	if stats, _ := replay("cron"); stats.Seeds != 1 {
		t.Errorf("a nightly run must solve; used %d seeds", stats.Seeds)
	}

	// A pool the stored days do not hold, or a stored vehicle that is not available, is solved.
	orders.pool = orders.pool[1:]
	if stats, _ := replay("catchup"); stats.Seeds != 1 {
		t.Errorf("an unmatched pool must be solved; used %d seeds", stats.Seeds)
	}
	orders, fleet = task2bAPIs(t)
	gone := want.Trips[0].VehicleID
	for n, v := range fleet.vehicles {
		if v.VehicleID == gone {
			fleet.vehicles = append(fleet.vehicles[:n], fleet.vehicles[n+1:]...)
			break
		}
	}
	if stats, _ := replay("catchup"); stats.Seeds != 1 {
		t.Errorf("a plan using unavailable %s must be solved again; used %d seeds", gone, stats.Seeds)
	}
}
