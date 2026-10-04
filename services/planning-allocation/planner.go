package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"math"
	"sort"
	"strings"
	"sync"
	"time"
)

// Planner builds, stores and publishes the schedule for one day.
type Planner interface {
	Plan(ctx context.Context, runID string, planDate time.Time) (*RunStats, error)
}

// Plan is what one planning run produces; PlanWriter stores it under the run.
type Plan struct {
	Trips          []TripDetail
	Deferrals      []DeferredOrder
	FleetAvailable map[string]int // depot -> vehicles available on the plan date
}

type PlanWriter interface {
	SavePlan(ctx context.Context, runID string, planDate time.Time, plan *Plan) error
	DiscardPlan(ctx context.Context, runID string) error
}

// ALNSPlanner runs algorithm 3 on the confirmed pool:
//  1. close the ordering window (idempotent cutoff sweep in Order Management),
//  2. read the confirmed pool and the fleet,
//  3. run ALNS3 with several seeds and keep the cheapest plan,
//  4. check booklet rules 1–7, store the plan, then write allocations and deferrals back to
//     Order Management in one all-or-nothing status batch.
type ALNSPlanner struct {
	orders OrdersAPI
	fleet  FleetAPI
	store  PlanWriter
	params ALNSParams
	seeds  int
}

const (
	statusBatchLimit = 500 // Order Management's per-call maximum
	itemFetchWorkers = 8
)

func (p *ALNSPlanner) Plan(ctx context.Context, runID string, planDate time.Time) (*RunStats, error) {
	day := planDate.Format(dateLayout)
	if _, err := p.orders.CloseWindow(ctx, day); err != nil {
		return nil, fmt.Errorf("cutoff sweep for %s: %w", day, err)
	}
	pool, err := p.orders.Confirmed(ctx, day)
	if err != nil {
		return nil, fmt.Errorf("read confirmed orders: %w", err)
	}
	vehicles, err := p.fleet.AvailableVehicles(ctx, day)
	if err != nil {
		return nil, fmt.Errorf("read available vehicles: %w", err)
	}
	year, week := planDate.ISOWeek()
	fuel, err := p.fleet.FuelUsage(ctx, year, week)
	if err != nil {
		return nil, fmt.Errorf("read fuel usage: %w", err)
	}
	metrics, err := p.fleet.TravelMetrics(ctx)
	if err != nil {
		return nil, fmt.Errorf("read travel metrics: %w", err)
	}
	orders, vehs, travel, err := buildInputs(pool, vehicles, fuel, metrics)
	if err != nil {
		return nil, err
	}

	start := time.Now()
	a, sol, seed := p.solve(orders, vehs, travel, planDate)
	stats := &RunStats{Orders: len(orders), Iterations: p.params.Iterations, Seeds: p.seeds, BestSeed: seed}
	plan := &Plan{FleetAvailable: map[string]int{}}
	for _, v := range vehs {
		plan.FleetAvailable[v.Depot]++
	}
	var trips []PlannedTrip
	if a != nil {
		trips = a.Trips(sol)
		if v := CheckRules(a, trips); len(v) > 0 {
			return nil, fmt.Errorf("plan breaks booklet rules: %s", strings.Join(v, "; "))
		}
		stats.Objective = math.Round(a.PlanCost(sol)*10) / 10
	}
	stats.SolveMs = time.Since(start).Milliseconds()

	items, err := p.fetchItems(ctx, trips, orders)
	if err != nil {
		return nil, err
	}
	used := map[int]bool{}
	for _, t := range trips {
		plan.Trips = append(plan.Trips, buildTrip(a, t, planDate, pool, items, runID))
		stats.Served += len(t.Orders)
		used[t.Vehicle] = true
	}
	if a != nil {
		for _, i := range sol.Unassigned() {
			reason, detail := a.deferralReason(i)
			c := pool[i]
			plan.Deferrals = append(plan.Deferrals, DeferredOrder{OrderRef: c.OrderRef, OutletID: c.OutletID,
				Depot: c.Depot, District: c.District, Brand: c.Brand, Temperature: c.TempRequirement,
				WeightKg: c.OrderWeightKg, VolumeM3: c.OrderVolumeM3, OrderDate: c.OriginalOrderDate,
				TimesDeferred: c.DeferralCount, Reason: reason, ReasonDetail: detail})
		}
	}
	stats.Deferred, stats.Trips, stats.VehiclesUsed = len(plan.Deferrals), len(plan.Trips), len(used)

	if err := p.store.SavePlan(ctx, runID, planDate, plan); err != nil {
		return nil, fmt.Errorf("store plan: %w", err)
	}
	if err := p.publish(ctx, plan); err != nil {
		return nil, fmt.Errorf("write allocations to order-management: %w", err)
	}
	log.Printf("[%s] planned %s: %d orders, %d served on %d trips, %d deferred (seed %d, %d ms)", serviceName, day,
		stats.Orders, stats.Served, stats.Trips, stats.Deferred, stats.BestSeed, stats.SolveMs)
	return stats, nil
}

// buildInputs maps API rows onto the algorithm's inputs. Order index i is pool[i].
func buildInputs(pool []ConfirmedOrder, vehicles []FleetVehicle, fuel []FleetFuelUsage, m TravelMetrics) (
	[]ALNSOrder, []ALNSVehicle, map[string]DistrictTravel, error) {
	travel := map[string]DistrictTravel{}
	for _, d := range m.DistrictTravel {
		travel[d.District] = DistrictTravel{Depot: d.Depot, DepotKm: d.DepotToDistrictKm,
			DepotMin: d.DepotToDistrictFreeflowMin, InterKm: d.InterStopKm, InterMin: d.InterStopFreeflowMin}
	}
	service := map[[2]string]float64{}
	for _, s := range m.ServiceAllowances {
		service[[2]string{s.Brand, s.DockType}] = s.AllowanceM
	}
	var problems []string
	orders := make([]ALNSOrder, len(pool))
	for i, c := range pool {
		open, err1 := hhmmToMin(c.WindowOpenTime)
		closeAt, err2 := hhmmToMin(c.WindowCloseTime)
		s, okS := service[[2]string{c.Brand, c.DockType}]
		_, okT := travel[c.District]
		switch {
		case err1 != nil || err2 != nil:
			problems = append(problems, fmt.Sprintf("%s: bad delivery window", c.OrderRef))
		case !okS:
			problems = append(problems, fmt.Sprintf("%s: no service allowance for %s/%s", c.OrderRef, c.Brand, c.DockType))
		case !okT:
			problems = append(problems, fmt.Sprintf("%s: no travel metrics for district %s", c.OrderRef, c.District))
		}
		hist := 0.0
		if c.DeferredYesterday { // Task 2B fairness weight: deferred_yesterday × days_since_last_served
			hist = float64(c.DaysSinceServed)
		}
		orders[i] = ALNSOrder{ID: c.OrderRef, Outlet: c.OutletID, Brand: c.Brand, District: c.District, Depot: c.Depot,
			Chilled: c.TempRequirement == "chilled", VanOnly: c.ParkingConstraint == "van_only",
			W: c.OrderWeightKg, V: c.OrderVolumeM3, S: s, E: open, L: closeAt, Hist: hist}
	}
	if len(problems) > 0 {
		return nil, nil, nil, errors.New("incomplete planning inputs: " + strings.Join(problems, "; "))
	}
	kmLeft := map[string]float64{}
	for _, f := range fuel {
		kmLeft[f.VehicleID] = f.KmLeft
	}
	vehs := make([]ALNSVehicle, 0, len(vehicles))
	for _, v := range vehicles {
		left, ok := kmLeft[v.VehicleID]
		if !ok {
			left = v.WeeklyRangeKm
		}
		vehs = append(vehs, ALNSVehicle{ID: v.VehicleID, Type: v.Type, Temp: v.Temp, Depot: v.Depot,
			W: v.WeightCapKg, V: v.VolumeCapM3, KmPerL: v.KmPerL, KmLeft: math.Max(left, 0)})
	}
	return orders, vehs, travel, nil
}

// solve runs ALNS3 once per seed (in parallel) and keeps the lowest-cost plan. Seeds derive from the
// plan date, so re-running a date reproduces the same plan for the same inputs.
func (p *ALNSPlanner) solve(orders []ALNSOrder, vehs []ALNSVehicle, travel map[string]DistrictTravel, date time.Time) (
	*ALNS, *Solution, uint64) {
	if len(orders) == 0 {
		return nil, nil, 0
	}
	y, m, d := date.Date()
	base := uint64(y*10000+int(m)*100+d) * 100
	type result struct {
		a    *ALNS
		sol  *Solution
		cost float64
		seed uint64
	}
	results := make([]result, p.seeds)
	var wg sync.WaitGroup
	for n := 0; n < p.seeds; n++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			prm := p.params
			prm.Seed = base + uint64(n)
			a := NewALNS(orders, vehs, travel, prm)
			sol := a.Run()
			results[n] = result{a, sol, a.cost(sol), prm.Seed}
		}(n)
	}
	wg.Wait()
	best := results[0]
	for _, r := range results[1:] {
		if r.cost < best.cost-1e-9 {
			best = r
		}
	}
	return best.a, best.sol, best.seed
}

// fetchItems copies each served order's lines from Order Management, so the loading manifest does
// not change if the order is edited later.
func (p *ALNSPlanner) fetchItems(ctx context.Context, trips []PlannedTrip, orders []ALNSOrder) (map[int][]StopItem, error) {
	var idx []int
	for _, t := range trips {
		idx = append(idx, t.Orders...)
	}
	out := make(map[int][]StopItem, len(idx))
	var mu sync.Mutex
	var firstErr error
	jobs := make(chan int)
	var wg sync.WaitGroup
	for w := 0; w < itemFetchWorkers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range jobs {
				lines, err := p.orders.Items(ctx, orders[i].ID)
				mu.Lock()
				if err != nil && firstErr == nil {
					firstErr = fmt.Errorf("read items of %s: %w", orders[i].ID, err)
				}
				items := make([]StopItem, 0, len(lines))
				for _, l := range lines {
					items = append(items, StopItem{SKU: l.SKU, Description: l.Description, Qty: l.Quantity})
				}
				out[i] = items
				mu.Unlock()
			}
		}()
	}
	for _, i := range idx {
		jobs <- i
	}
	close(jobs)
	wg.Wait()
	return out, firstErr
}

func buildTrip(a *ALNS, t PlannedTrip, date time.Time, pool []ConfirmedOrder, items map[int][]StopItem, runID string) TripDetail {
	veh := a.V[t.Vehicle]
	first := a.O[t.Orders[0]]
	id := fmt.Sprintf("%s-%s-T%d", date.Format("20060102"), veh.ID, t.TripNumber)
	trip := Trip{TripID: id, TripNumber: t.TripNumber, Brand: first.Brand, District: first.District,
		DepartureTime: minToHHMM(t.Departure), ReturnTime: minToHHMM(t.Return), DurationMin: int(math.Round(t.Minutes)),
		DistanceKm: round(t.Km, 1), FuelLitres: round(t.Km/veh.KmPerL, 1), Stops: []Stop{}}
	for n, i := range t.Orders {
		o, c := a.O[i], pool[i]
		trip.WeightKg += o.W
		trip.VolumeM3 += o.V
		trip.Stops = append(trip.Stops, Stop{StopID: fmt.Sprintf("%s-S%d", id, n+1), Sequence: n + 1,
			OrderRef: o.ID, OutletID: o.Outlet, Brand: o.Brand, Temperature: c.TempRequirement,
			WeightKg: o.W, VolumeM3: o.V, ETA: minToHHMM(t.Arrival[i]), WindowOpen: c.WindowOpenTime,
			WindowClose: c.WindowCloseTime, LateMin: round(math.Max(0, t.Arrival[i]-o.L), 1), Items: items[i]})
	}
	trip.WeightUtilization = round(trip.WeightKg/veh.W, 4)
	trip.VolumeUtilization = round(trip.VolumeM3/veh.V, 4)
	trip.WeightKg, trip.VolumeM3 = round(trip.WeightKg, 1), round(trip.VolumeM3, 3)
	return TripDetail{Trip: trip, PlanDate: date.Format(dateLayout), Depot: veh.Depot, VehicleID: veh.ID,
		VehicleType: veh.Type, VehicleTemp: veh.Temp, WeightCapacityKg: veh.W, VolumeCapacityM3: veh.V, PlanRunID: runID}
}

// publish writes allocations and deferrals to Order Management. Each call is all-or-nothing there;
// a pool larger than one call's limit is split, in which case earlier chunks stay applied on failure.
func (p *ALNSPlanner) publish(ctx context.Context, plan *Plan) error {
	var updates []StatusUpdate
	for _, t := range plan.Trips {
		for _, s := range t.Stops {
			updates = append(updates, StatusUpdate{OrderRef: s.OrderRef, Status: "allocated", VehicleID: t.VehicleID, TripID: t.TripNumber})
		}
	}
	for _, d := range plan.Deferrals {
		updates = append(updates, StatusUpdate{OrderRef: d.OrderRef, Status: "deferred", ReasonCode: string(d.Reason), ReasonNote: d.ReasonDetail})
	}
	for len(updates) > 0 {
		n := min(len(updates), statusBatchLimit)
		if err := p.orders.StatusBatch(ctx, updates[:n]); err != nil {
			return err
		}
		updates = updates[n:]
	}
	return nil
}

// deferralReason explains why order i was left unassigned, using Order Management's reason codes.
// It first checks whether any vehicle could carry the order at all, then whether a trip with just
// this order fits a vehicle's day, and otherwise blames contention for the suitable vehicles.
func (a *ALNS) deferralReason(i int) (DeferralReason, string) {
	o := a.O[i]
	var depot, typed []int
	for k, v := range a.V {
		if v.Depot == o.Depot {
			depot = append(depot, k)
		}
	}
	if len(depot) == 0 {
		return ReasonVehicleUnavailable, fmt.Sprintf("No %s vehicle is available on the plan date.", o.Depot)
	}
	for _, k := range depot {
		v := a.V[k]
		if (!o.Chilled || v.Temp == "reefer") && (!o.VanOnly || v.Type == "van") {
			typed = append(typed, k)
		}
	}
	if len(typed) == 0 {
		if o.Chilled && o.VanOnly {
			return ReasonNoReeferAvailable, fmt.Sprintf("No refrigerated van is available at %s for this van-only outlet.", o.Depot)
		}
		if o.Chilled {
			return ReasonNoReeferAvailable, fmt.Sprintf("No refrigerated vehicle is available at %s.", o.Depot)
		}
		return ReasonNoVanForVanOnly, fmt.Sprintf("No van is available at %s for this van-only outlet.", o.Depot)
	}
	maxV, maxW := 0.0, 0.0
	for _, k := range typed {
		maxV, maxW = math.Max(maxV, a.V[k].V), math.Max(maxW, a.V[k].W)
	}
	kind := "vehicle"
	switch {
	case o.Chilled && o.VanOnly:
		kind = "refrigerated van (van-only outlet)"
	case o.Chilled:
		kind = "refrigerated vehicle"
	case o.VanOnly:
		kind = "van (van-only outlet)"
	}
	if o.V > maxV {
		return ReasonCapacityVolume, fmt.Sprintf("%.2f m³ is larger than the largest %s at %s (%.2f m³); orders cannot be split.", o.V, kind, o.Depot, maxV)
	}
	if o.W > maxW {
		return ReasonCapacityWeight, fmt.Sprintf("%.0f kg is more than the largest %s at %s carries (%.0f kg); orders cannot be split.", o.W, kind, o.Depot, maxW)
	}
	if len(a.compat[i]) == 0 {
		return ReasonCapacityVolume, fmt.Sprintf("No single %s at %s takes both %.0f kg and %.2f m³; orders cannot be split.", kind, o.Depot, o.W, o.V)
	}
	alone := [][]int{{i}}
	budget := a.p.OtherBudget
	if o.Brand == "Fresh" {
		budget = a.p.FreshBudget
	}
	if m := a.tripMinutes(alone[0]); m > budget+1e-9 {
		return ReasonTimeBudgetExceeded, fmt.Sprintf("A trip to this outlet takes %.0f min, over the %.0f-minute %s budget.", m, budget, o.Brand)
	}
	fits := false
	for _, k := range a.compat[i] {
		if _, _, ok := a.evalBase(k, alone, nil); ok {
			fits = true
			break
		}
	}
	if !fits {
		return ReasonFuelQuotaExceeded, fmt.Sprintf("No suitable vehicle at %s has %.0f km of weekly range left for this trip.", o.Depot, a.tripKm(alone[0]))
	}
	switch {
	case o.Chilled:
		return ReasonNoReeferAvailable, fmt.Sprintf("All refrigerated vehicles at %s are fully booked within the %.0f-minute Fresh budget.", o.Depot, a.p.FreshBudget)
	case o.VanOnly:
		return ReasonNoVanForVanOnly, fmt.Sprintf("All vans at %s are fully booked.", o.Depot)
	}
	return ReasonCapacityVolume, fmt.Sprintf("All suitable vehicles at %s are fully booked.", o.Depot)
}

// sortTrips orders trips the way schedules are listed: by vehicle, then trip number.
func sortTrips(ts []TripDetail) {
	sort.SliceStable(ts, func(x, y int) bool {
		if ts[x].VehicleID != ts[y].VehicleID {
			return ts[x].VehicleID < ts[y].VehicleID
		}
		return ts[x].TripNumber < ts[y].TripNumber
	})
}
