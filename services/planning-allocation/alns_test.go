package main

import (
	"encoding/csv"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

// The challenge data lives in the repo's data/ folder; it is not part of the Docker build context.
var dataDir = filepath.Join("..", "..", "data")

func readCSV(t *testing.T, rel string) []map[string]string {
	t.Helper()
	f, err := os.Open(filepath.Join(dataDir, rel))
	if err != nil {
		t.Skipf("challenge data not available: %v", err)
	}
	defer f.Close()
	rows, err := csv.NewReader(f).ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	head := rows[0]
	var out []map[string]string
	for _, r := range rows[1:] {
		m := map[string]string{}
		for i, h := range head {
			m[strings.TrimSpace(h)] = strings.TrimSpace(r[i])
		}
		out = append(out, m)
	}
	return out
}

func num(t *testing.T, s string) float64 {
	t.Helper()
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		t.Fatalf("parse %q: %v", s, err)
	}
	return f
}

// task2bInputs builds the notebook's Task 2B scenario-S1 inputs (cell 18).
func task2bInputs(t *testing.T) ([]ALNSOrder, []ALNSVehicle, map[string]DistrictTravel) {
	service := map[[2]string]float64{}
	for _, r := range readCSV(t, "General Data/service_allowance.csv") {
		service[[2]string{r["brand"], r["dock_type"]}] = num(t, r["service_allowance_min"])
	}
	travel := map[string]DistrictTravel{}
	for _, r := range readCSV(t, "General Data/district_travel.csv") {
		travel[r["district"]] = DistrictTravel{Depot: r["depot"], DepotKm: num(t, r["depot_to_district_km"]),
			DepotMin: num(t, r["depot_to_district_freeflow_min"]), InterKm: num(t, r["inter_stop_km"]),
			InterMin: num(t, r["inter_stop_freeflow_min"])}
	}
	status := map[string]string{}
	for _, r := range readCSV(t, "Test Data/task2b_peak_day_fleet.csv") {
		if r["scenario"] == "S1" {
			status[r["vehicle_id"]] = r["status"]
		}
	}
	var vehicles []ALNSVehicle
	for _, r := range readCSV(t, "General Data/vehicles.csv") {
		if status[r["vehicle_id"]] != "available" {
			continue
		}
		vehicles = append(vehicles, ALNSVehicle{ID: r["vehicle_id"], Type: r["type"], Temp: r["temp"], Depot: r["depot"],
			W: num(t, r["weight_cap_kg"]), V: num(t, r["volume_cap_m3"]), KmPerL: num(t, r["km_per_l"]),
			KmLeft: num(t, r["weekly_range_km"])})
	}
	var orders []ALNSOrder
	for _, r := range readCSV(t, "Test Data/task2b_peak_day_scenarios.csv") {
		if r["scenario"] != "S1" {
			continue
		}
		open, _ := hhmmToMin(r["window_open_time"])
		closeAt, _ := hhmmToMin(r["window_close_time"])
		orders = append(orders, ALNSOrder{ID: r["order_ref"], Outlet: r["outlet_id"], Brand: r["brand"],
			District: r["district"], Depot: r["depot"], Chilled: r["temp_requirement"] == "chilled",
			VanOnly: r["parking_constraint"] == "van_only", W: num(t, r["order_weight_kg"]), V: num(t, r["order_volume_m3"]),
			S: service[[2]string{r["brand"], r["dock_type"]}], E: open, L: closeAt,
			Hist: num(t, r["deferred_yesterday"]) * num(t, r["days_since_last_served"])})
	}
	return orders, vehicles, travel
}

// Notebook results on S1, 5 seeds × 2000 iterations: algorithm 3 served 75.6 of 85 on average
// (best 77), chilled 17.6 of 26. Go's RNG differs from Python's, so the check is a floor on the same
// 5-seed protocol rather than equality.
func TestALNS3Task2BScenarioS1(t *testing.T) {
	if testing.Short() {
		t.Skip("runs 5 × 2000 ALNS iterations")
	}
	orders, vehicles, travel := task2bInputs(t)
	if len(orders) != 85 {
		t.Fatalf("loaded %d orders, want 85", len(orders))
	}
	total, best := 0, 0
	for seed := uint64(0); seed < 5; seed++ {
		p := DefaultALNSParams()
		p.Seed = seed
		a := NewALNS(orders, vehicles, travel, p)
		start := time.Now()
		sol := a.Run()
		trips := a.Trips(sol)
		if v := CheckRules(a, trips); len(v) > 0 {
			t.Fatalf("seed %d: %d booklet rule violations:\n%s", seed, len(v), strings.Join(v, "\n"))
		}
		served, chilled := 0, 0
		for _, tr := range trips {
			served += len(tr.Orders)
			for _, i := range tr.Orders {
				if orders[i].Chilled {
					chilled++
				}
			}
		}
		if served+len(sol.U) != len(orders) {
			t.Fatalf("seed %d: served %d + unassigned %d != %d orders", seed, served, len(sol.U), len(orders))
		}
		t.Logf("seed %d: served %d of %d (chilled %d of 26), %d trips, objective %.1f, %s", seed,
			served, len(orders), chilled, len(trips), a.PlanCost(sol), time.Since(start).Round(time.Millisecond))
		total += served
		best = max(best, served)
	}
	if mean := float64(total) / 5; mean < 75 || best < 77 {
		t.Errorf("mean served %.1f (want ≥ 75, notebook 75.6), best %d (want ≥ 77)", mean, best)
	}
}

func TestALNS3IsDeterministicPerSeed(t *testing.T) {
	orders, vehicles, travel := task2bInputs(t)
	p := DefaultALNSParams()
	p.Iterations, p.Seed = 150, 7
	run := func() float64 { a := NewALNS(orders, vehicles, travel, p); return a.cost(a.Run()) }
	if c1, c2 := run(), run(); c1 != c2 {
		t.Errorf("same seed gave different costs: %v vs %v", c1, c2)
	}
}

// A chilled trip runs the reefer cold, so it cannot also carry ambient orders; a reefer may still run
// an all-ambient trip.
func TestTripsDoNotMixChilledAndAmbient(t *testing.T) {
	order := func(id string, chilled bool) ALNSOrder {
		return ALNSOrder{ID: id, Outlet: id, Brand: "Fresh", District: "D1", Depot: "DEP1", Chilled: chilled,
			W: 10, V: 0.1, S: 5, E: 0, L: 1440}
	}
	orders := []ALNSOrder{order("C1", true), order("C2", true), order("A1", false), order("A2", false)}
	vehicles := []ALNSVehicle{{ID: "R1", Type: "truck", Temp: "reefer", Depot: "DEP1", W: 1000, V: 10, KmPerL: 8, KmLeft: 1000}}
	travel := map[string]DistrictTravel{"D1": {Depot: "DEP1", DepotKm: 5, DepotMin: 10, InterKm: 1, InterMin: 3}}
	a := NewALNS(orders, vehicles, travel, DefaultALNSParams())

	for _, c := range []struct {
		name  string
		trips [][]int
		ok    bool
	}{
		{"all chilled", [][]int{{0, 1}}, true},
		{"all ambient on a reefer", [][]int{{2, 3}}, true},
		{"chilled trip then ambient trip", [][]int{{0, 1}, {2, 3}}, true},
		{"mixed trip", [][]int{{0, 2}}, false},
	} {
		if _, _, ok := a.evalBase(0, c.trips, nil); ok != c.ok {
			t.Errorf("%s: feasible = %v, want %v", c.name, ok, c.ok)
		}
	}

	trips := a.Trips(a.Run())
	if v := CheckRules(a, trips); len(v) > 0 {
		t.Fatalf("rule violations:\n%s", strings.Join(v, "\n"))
	}
	if len(trips) != 2 {
		t.Errorf("got %d trips, want one chilled and one ambient", len(trips))
	}
	mixed := []PlannedTrip{{Vehicle: 0, TripNumber: 1, Orders: []int{0, 2}}}
	if v := CheckRules(a, mixed); len(v) == 0 {
		t.Error("CheckRules accepted a trip mixing chilled and ambient orders")
	}
}
