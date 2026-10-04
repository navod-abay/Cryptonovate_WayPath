package main

// Go port of algorithm 3 (ALNS3) from data_exploration/algo3/algo3.ipynb: the algorithm-2 ALNS
// (random / Shaw / worst removal; greedy / regret-k / time-window regret insertion, simulated
// annealing acceptance, adaptive operator weights) plus the algorithm-3 additions:
//   - a lost-second-trip penalty on scarce vehicles whose single Fresh trip leaves no room for another,
//   - a district destroy operator,
//   - a right-size pass after every repair that moves whole trips to cheaper compatible vehicles,
//   - one representative idle vehicle per model as an insertion candidate.
//
// Slices are used wherever the Python relies on dict/list order, so a run is reproducible per seed.

import (
	"math"
	"math/rand/v2"
	"sort"
)

type ALNSOrder struct {
	ID       string
	Outlet   string
	Brand    string
	District string
	Depot    string
	Chilled  bool
	VanOnly  bool
	W, V     float64 // weight kg, volume m³
	S        float64 // service (handling) minutes
	E, L     float64 // delivery window open/close, minutes after midnight
	Hist     float64 // fairness weight: deferred_yesterday × days_since_last_served
}

type ALNSVehicle struct {
	ID, Type, Temp, Depot string
	W, V, KmPerL, KmLeft  float64
}

type DistrictTravel struct {
	Depot    string
	DepotKm  float64 // depot_to_district_km
	DepotMin float64 // depot_to_district_freeflow_min
	InterKm  float64 // inter_stop_km
	InterMin float64 // inter_stop_freeflow_min
}

type ALNSParams struct {
	Iterations                     int
	Seed                           uint64
	FixedCost, FuelCost            float64
	LatePenalty, UnassignedPenalty float64
	HistoryWeight                  float64
	FreshStart, OtherStart         float64
	ReloadMin                      float64
	FreshBudget, OtherBudget       float64
	MinRemove, MaxRemove           int
	MaxRemoveFrac                  float64
	CoolingRate, StartTempFrac     float64
	ReactionFactor                 float64
	SegmentLength                  int
	Sigma1, Sigma2, Sigma3         float64
	RegretK                        int
	TWRegretWeight                 float64
	ShawP, WorstP                  float64
	ShawDistrict, ShawBrand        float64
	ShawTime, ShawVolume           float64
	LostTripCost                   float64
	RightsizePasses                int
}

// DefaultALNSParams are the notebook's DEFAULTS with the algorithm-3 extras (lost_trip_cost=200,
// rightsize_passes=3).
func DefaultALNSParams() ALNSParams {
	return ALNSParams{
		Iterations: 2000, Seed: 0,
		FixedCost: 20, FuelCost: 1, LatePenalty: 50, UnassignedPenalty: 1000, HistoryWeight: 0.5,
		FreshStart: 210, OtherStart: 480, ReloadMin: 0, FreshBudget: 270, OtherBudget: 480,
		MinRemove: 2, MaxRemove: 30, MaxRemoveFrac: 0.25,
		CoolingRate: 0.995, StartTempFrac: 0.05, ReactionFactor: 0.1, SegmentLength: 50,
		Sigma1: 33, Sigma2: 13, Sigma3: 9,
		RegretK: 3, TWRegretWeight: 100, ShawP: 6, WorstP: 3,
		ShawDistrict: 9, ShawBrand: 3, ShawTime: 3, ShawVolume: 2,
		LostTripCost: 200, RightsizePasses: 3,
	}
}

type Solution struct {
	Routes [][][]int // vehicle -> trips -> order indexes (visit order)
	VCost  []float64
	Late   []float64
	U      map[int]struct{} // unassigned orders
}

func newSolution(nVeh int) *Solution {
	return &Solution{Routes: make([][][]int, nVeh), VCost: make([]float64, nVeh), Late: make([]float64, nVeh),
		U: map[int]struct{}{}}
}

func (s *Solution) copy() *Solution {
	c := &Solution{Routes: make([][][]int, len(s.Routes)), VCost: append([]float64(nil), s.VCost...),
		Late: append([]float64(nil), s.Late...), U: make(map[int]struct{}, len(s.U))}
	for k, r := range s.Routes {
		c.Routes[k] = copyTrips(r)
	}
	for i := range s.U {
		c.U[i] = struct{}{}
	}
	return c
}

// Unassigned returns the unassigned order indexes in ascending order.
func (s *Solution) Unassigned() []int {
	out := make([]int, 0, len(s.U))
	for i := range s.U {
		out = append(out, i)
	}
	sort.Ints(out)
	return out
}

func copyTrips(trips [][]int) [][]int {
	out := make([][]int, len(trips))
	for i, t := range trips {
		out[i] = append([]int(nil), t...)
	}
	return out
}

type vehicleModel struct {
	depot, typ, temp string
	w, v, kmPerL     float64
}

type insertion struct {
	delta float64
	ti    int // -1 = open a new trip
	pos   int
	slack float64 // window close minus arrival at the chosen position
}

type candOpt struct {
	k int
	b *insertion // nil = infeasible on this vehicle
}

type loc struct{ k, ti int }

type ALNS struct {
	O  []ALNSOrder
	V  []ALNSVehicle
	tr map[string]DistrictTravel
	p  ALNSParams

	rng       *rand.Rand
	compat    [][]int
	compatSet []map[int]bool
	pen       []float64
	maxV      float64

	model         []vehicleModel
	depotVmax     map[string]float64
	minExtraFresh map[string]float64
	scarcity      []float64

	destroyNames []string
	repairNames  []string

	// Weights holds the adaptive operator weights after Run.
	Weights map[string]map[string]float64
}

func NewALNS(orders []ALNSOrder, vehicles []ALNSVehicle, travel map[string]DistrictTravel, p ALNSParams) *ALNS {
	a := &ALNS{O: orders, V: vehicles, tr: travel, p: p, rng: rand.New(rand.NewPCG(p.Seed, p.Seed^0x9e3779b97f4a7c15)),
		destroyNames: []string{"random", "shaw", "worst", "district"},
		repairNames:  []string{"greedy", "regret", "tw_regret"}}
	a.compat = make([][]int, len(orders))
	a.compatSet = make([]map[int]bool, len(orders))
	a.pen = make([]float64, len(orders))
	for i, o := range orders {
		a.compatSet[i] = map[int]bool{}
		for k, veh := range vehicles {
			if veh.Depot == o.Depot && (!o.Chilled || veh.Temp == "reefer") && (!o.VanOnly || veh.Type == "van") &&
				o.W <= veh.W && o.V <= veh.V {
				a.compat[i] = append(a.compat[i], k)
				a.compatSet[i][k] = true
			}
		}
		a.pen[i] = p.UnassignedPenalty * (1 + p.HistoryWeight*o.Hist)
		a.maxV = math.Max(a.maxV, o.V)
	}
	if a.maxV == 0 {
		a.maxV = 1
	}

	a.model = make([]vehicleModel, len(vehicles))
	a.depotVmax = map[string]float64{}
	for k, v := range vehicles {
		a.model[k] = vehicleModel{v.Depot, v.Type, v.Temp, v.W, v.V, v.KmPerL}
		a.depotVmax[v.Depot] = math.Max(a.depotVmax[v.Depot], v.V)
	}
	minService := math.Inf(1)
	for _, o := range orders {
		if o.Brand == "Fresh" {
			minService = math.Min(minService, o.S)
		}
	}
	if math.IsInf(minService, 1) {
		minService = 15
	}
	a.minExtraFresh = map[string]float64{}
	for _, d := range travel {
		t := d.DepotMin + minService
		if cur, ok := a.minExtraFresh[d.Depot]; !ok || t < cur {
			a.minExtraFresh[d.Depot] = t
		}
	}
	chilledM3, freshM3, reeferM3, fleetM3 := map[string]float64{}, map[string]float64{}, map[string]float64{}, map[string]float64{}
	for _, o := range orders {
		if o.Brand == "Fresh" {
			freshM3[o.Depot] += o.V
			if o.Chilled {
				chilledM3[o.Depot] += o.V
			}
		}
	}
	for _, v := range vehicles {
		fleetM3[v.Depot] += v.V
		if v.Temp == "reefer" {
			reeferM3[v.Depot] += v.V
		}
	}
	a.scarcity = make([]float64, len(vehicles))
	for k, v := range vehicles {
		demand, capacity := freshM3[v.Depot], fleetM3[v.Depot]
		if v.Temp == "reefer" {
			demand, capacity = chilledM3[v.Depot], reeferM3[v.Depot]
		}
		ratio := demand / math.Max(capacity, 1e-9)
		a.scarcity[k] = math.Min(math.Max(ratio-1, 0), 1)
	}
	return a
}

// schedule orders a vehicle's trips for the day: Fresh first (stable).
func (a *ALNS) schedule(trips [][]int) [][]int {
	out := append([][]int(nil), trips...)
	sort.SliceStable(out, func(x, y int) bool {
		return a.O[out[x][0]].Brand == "Fresh" && a.O[out[y][0]].Brand != "Fresh"
	})
	return out
}

// evalBase is algorithm 2's eval_vehicle. onArrive (optional) receives every order's arrival minute.
func (a *ALNS) evalBase(k int, trips [][]int, onArrive func(i int, t float64)) (cost, late float64, ok bool) {
	if len(trips) == 0 {
		return 0, 0, true
	}
	if len(trips) > 2 {
		return 0, 0, false
	}
	p, veh := a.p, a.V[k]
	var km, freshMin, otherMin float64
	clock, haveClock := 0.0, false
	for _, trip := range a.schedule(trips) {
		first := a.O[trip[0]]
		brand, dist := first.Brand, first.District
		var w, v, handling float64
		for _, i := range trip {
			o := a.O[i]
			if o.Brand != brand || o.District != dist {
				return 0, 0, false
			}
			w += o.W
			v += o.V
			handling += o.S
		}
		if w > veh.W+1e-9 || v > veh.V+1e-9 {
			return 0, 0, false
		}
		d := a.tr[dist]
		minutes := d.DepotMin + d.InterMin*float64(len(trip)-1) + handling
		start := p.OtherStart
		if brand == "Fresh" {
			freshMin += minutes
			start = p.FreshStart
		} else {
			otherMin += minutes
		}
		t := start
		if haveClock {
			t = math.Max(start, clock+p.ReloadMin)
		}
		t += d.DepotMin
		prev := ""
		outlets := map[string]bool{}
		for idx, i := range trip {
			o := a.O[i]
			if idx > 0 && o.Outlet != prev {
				t += d.InterMin
			}
			if onArrive != nil {
				onArrive(i, t)
			}
			if t > o.L {
				late += t - o.L
			}
			t = math.Max(t, o.E) + o.S
			prev = o.Outlet
			outlets[o.Outlet] = true
		}
		clock, haveClock = t+d.DepotMin, true
		km += 2*d.DepotKm + d.InterKm*float64(len(outlets)-1)
	}
	if freshMin > p.FreshBudget+1e-9 || otherMin > p.OtherBudget+1e-9 {
		return 0, 0, false
	}
	if km > veh.KmLeft+1e-9 {
		return 0, 0, false
	}
	return p.FixedCost + p.FuelCost*km/veh.KmPerL + p.LatePenalty*late, late, true
}

func (a *ALNS) tripMinutes(trip []int) float64 {
	d := a.tr[a.O[trip[0]].District]
	m := d.DepotMin + d.InterMin*float64(len(trip)-1)
	for _, i := range trip {
		m += a.O[i].S
	}
	return m
}

func (a *ALNS) tripKm(trip []int) float64 {
	d := a.tr[a.O[trip[0]].District]
	outlets := map[string]bool{}
	for _, i := range trip {
		outlets[a.O[i].Outlet] = true
	}
	return 2*d.DepotKm + d.InterKm*float64(len(outlets)-1)
}

// eval is algorithm 3's eval_vehicle: the base cost plus the lost-second-trip penalty.
func (a *ALNS) eval(k int, trips [][]int, onArrive func(i int, t float64)) (float64, float64, bool) {
	c, late, ok := a.evalBase(k, trips, onArrive)
	if !ok || a.scarcity[k] == 0 {
		return c, late, ok
	}
	var fresh [][]int
	for _, t := range trips {
		if a.O[t[0]].Brand == "Fresh" {
			fresh = append(fresh, t)
		}
	}
	if len(fresh) != 1 {
		return c, late, ok
	}
	veh := a.V[k]
	if a.p.FreshBudget-a.tripMinutes(fresh[0]) < a.minExtraFresh[veh.Depot] {
		c += a.p.LostTripCost * a.scarcity[k] * veh.V / a.depotVmax[veh.Depot]
	}
	return c, late, ok
}

func (a *ALNS) cost(s *Solution) float64 {
	total := 0.0
	for _, c := range s.VCost {
		total += c
	}
	for _, i := range s.Unassigned() {
		total += a.pen[i]
	}
	return total
}

func (a *ALNS) refresh(s *Solution, k int) {
	c, late, ok := a.eval(k, s.Routes[k], nil)
	if !ok {
		panic("alns: vehicle became infeasible")
	}
	s.VCost[k], s.Late[k] = c, late
}

func (a *ALNS) locate(s *Solution) ([]int, map[int]loc) {
	var order []int
	where := map[int]loc{}
	for k, r := range s.Routes {
		for ti, t := range r {
			for _, i := range t {
				order = append(order, i)
				where[i] = loc{k, ti}
			}
		}
	}
	return order, where
}

func (a *ALNS) remove(s *Solution, i int, where map[int]loc) {
	w := where[i]
	trip := s.Routes[w.k][w.ti]
	for idx, x := range trip {
		if x == i {
			trip = append(trip[:idx:idx], trip[idx+1:]...)
			break
		}
	}
	if len(trip) == 0 {
		s.Routes[w.k] = append(s.Routes[w.k][:w.ti:w.ti], s.Routes[w.k][w.ti+1:]...)
		for j, l := range where {
			if l.k == w.k && l.ti > w.ti {
				where[j] = loc{l.k, l.ti - 1}
			}
		}
	} else {
		s.Routes[w.k][w.ti] = trip
	}
	delete(where, i)
	a.refresh(s, w.k)
}

func (a *ALNS) bestInVehicle(s *Solution, i, k int) *insertion {
	o, trips, base := a.O[i], s.Routes[k], s.VCost[k]
	var best *insertion
	try := func(newTrips [][]int, ti, pos int) {
		var arr float64
		c, _, ok := a.eval(k, newTrips, func(j int, t float64) {
			if j == i {
				arr = t
			}
		})
		if ok && (best == nil || c-base < best.delta) {
			best = &insertion{delta: c - base, ti: ti, pos: pos, slack: o.L - arr}
		}
	}
	for ti, trip := range trips {
		f := a.O[trip[0]]
		if f.Brand != o.Brand || f.District != o.District {
			continue
		}
		for pos := 0; pos <= len(trip); pos++ {
			newTrips := make([][]int, len(trips))
			copy(newTrips, trips)
			nt := make([]int, 0, len(trip)+1)
			nt = append(append(append(nt, trip[:pos]...), i), trip[pos:]...)
			newTrips[ti] = nt
			try(newTrips, ti, pos)
		}
	}
	if len(trips) < 2 {
		newTrips := append(append([][]int(nil), trips...), []int{i})
		try(newTrips, -1, 0)
	}
	return best
}

func (a *ALNS) insert(s *Solution, i, k, ti, pos int) {
	if ti == -1 {
		s.Routes[k] = append(s.Routes[k], []int{i})
	} else {
		t := s.Routes[k][ti]
		nt := make([]int, 0, len(t)+1)
		s.Routes[k][ti] = append(append(append(nt, t[:pos]...), i), t[pos:]...)
	}
	a.refresh(s, k)
}

// candidates: compatible vehicles already in use, plus one idle representative per vehicle model
// (the one with the most weekly range left).
func (a *ALNS) candidates(s *Solution, i int) []int {
	var out []int
	var models []vehicleModel
	reps := map[vehicleModel]int{}
	for _, k := range a.compat[i] {
		if len(s.Routes[k]) > 0 {
			out = append(out, k)
			continue
		}
		m := a.model[k]
		r, seen := reps[m]
		if !seen {
			models = append(models, m)
			reps[m] = k
		} else if a.V[k].KmLeft > a.V[r].KmLeft {
			reps[m] = k
		}
	}
	for _, m := range models {
		out = append(out, reps[m])
	}
	return out
}

type chooseFn func(pool []int, opts map[int][]candOpt) int

func (a *ALNS) repairWith(s *Solution, pool []int, choose chooseFn) *Solution {
	pool = append([]int(nil), pool...)
	opts := make(map[int][]candOpt, len(pool))
	for _, i := range pool {
		for _, k := range a.candidates(s, i) {
			opts[i] = append(opts[i], candOpt{k, a.bestInVehicle(s, i, k)})
		}
	}
	for len(pool) > 0 {
		i := choose(pool, opts)
		if i < 0 {
			break
		}
		var pick *candOpt
		for idx := range opts[i] {
			c := &opts[i][idx]
			if c.b != nil && (pick == nil || c.b.delta < pick.b.delta) {
				pick = c
			}
		}
		k := pick.k
		a.insert(s, i, k, pick.b.ti, pick.b.pos)
		for idx, x := range pool {
			if x == i {
				pool = append(pool[:idx:idx], pool[idx+1:]...)
				break
			}
		}
		for _, j := range pool {
			old := map[int]*insertion{}
			for _, c := range opts[j] {
				old[c.k] = c.b
			}
			var next []candOpt
			for _, c := range a.candidates(s, j) {
				if b, ok := old[c]; ok && c != k {
					next = append(next, candOpt{c, b})
				} else {
					next = append(next, candOpt{c, a.bestInVehicle(s, j, c)})
				}
			}
			opts[j] = next
		}
	}
	for _, i := range pool {
		s.U[i] = struct{}{}
	}
	return s
}

func feasibleSorted(opts []candOpt) []*insertion {
	var f []*insertion
	for _, c := range opts {
		if c.b != nil {
			f = append(f, c.b)
		}
	}
	sort.SliceStable(f, func(x, y int) bool { return f[x].delta < f[y].delta })
	return f
}

func (a *ALNS) repairGreedy(s *Solution, pool []int) *Solution {
	return a.repairWith(s, pool, func(pool []int, opts map[int][]candOpt) int {
		best, bestC := -1, 0.0
		for _, i := range pool {
			f := feasibleSorted(opts[i])
			if len(f) > 0 && f[0].delta < a.pen[i] && (best < 0 || f[0].delta < bestC) {
				best, bestC = i, f[0].delta
			}
		}
		return best
	})
}

func (a *ALNS) repairRegret(s *Solution, pool []int) *Solution {
	kk := a.p.RegretK
	return a.repairWith(s, pool, func(pool []int, opts map[int][]candOpt) int {
		best := -1
		var bestKey [2]float64
		for _, i := range pool {
			f := feasibleSorted(opts[i])
			if len(f) == 0 || f[0].delta >= a.pen[i] {
				continue
			}
			c := make([]float64, 0, max(len(f), kk))
			for _, b := range f {
				c = append(c, b.delta)
			}
			for len(c) < kk {
				c = append(c, a.pen[i])
			}
			regret := 0.0
			for h := 1; h < kk; h++ {
				regret += c[h] - c[0]
			}
			key := [2]float64{regret, -c[0]}
			if best < 0 || keyGreater(key, bestKey) {
				best, bestKey = i, key
			}
		}
		return best
	})
}

func (a *ALNS) repairTWRegret(s *Solution, pool []int) *Solution {
	gamma := a.p.TWRegretWeight
	return a.repairWith(s, pool, func(pool []int, opts map[int][]candOpt) int {
		best := -1
		var bestKey [2]float64
		for _, i := range pool {
			f := feasibleSorted(opts[i])
			if len(f) == 0 || f[0].delta >= a.pen[i] {
				continue
			}
			c1, c2 := f[0].delta, a.pen[i]
			if len(f) > 1 {
				c2 = f[1].delta
			}
			o := a.O[i]
			width := math.Max(o.L-o.E, 1)
			urgency := 1 - math.Min(math.Max(f[0].slack/width, 0), 1)
			key := [2]float64{c2 - c1 + gamma*urgency, -c1}
			if best < 0 || keyGreater(key, bestKey) {
				best, bestKey = i, key
			}
		}
		return best
	})
}

func keyGreater(a, b [2]float64) bool {
	if a[0] != b[0] {
		return a[0] > b[0]
	}
	return a[1] > b[1]
}

func (a *ALNS) repair(name string, s *Solution, pool []int) *Solution {
	switch name {
	case "greedy":
		s = a.repairGreedy(s, pool)
	case "regret":
		s = a.repairRegret(s, pool)
	default:
		s = a.repairTWRegret(s, pool)
	}
	return a.rightsize(s)
}

// rightsize moves whole trips to other compatible vehicles when that lowers the total cost.
func (a *ALNS) rightsize(s *Solution) *Solution {
	for pass := 0; pass < a.p.RightsizePasses; pass++ {
		moved := false
		for k := range a.V {
			for ti := 0; ti < len(s.Routes[k]); ti++ {
				trip := s.Routes[k][ti]
				var rest [][]int
				for j, t := range s.Routes[k] {
					if j != ti {
						rest = append(rest, t)
					}
				}
				srcC, _, _ := a.eval(k, rest, nil)
				var dests []int
				for d := range a.V {
					if d == k {
						continue
					}
					all := true
					for _, i := range trip {
						if !a.compatSet[i][d] {
							all = false
							break
						}
					}
					if all {
						dests = append(dests, d)
					}
				}
				sort.SliceStable(dests, func(x, y int) bool { return a.V[dests[x]].KmLeft > a.V[dests[y]].KmLeft })
				bestD, bestDelta := -1, 0.0
				seen := map[vehicleModel]bool{}
				for _, d := range dests {
					if len(s.Routes[d]) >= 2 {
						continue
					}
					if len(s.Routes[d]) == 0 {
						if seen[a.model[d]] {
							continue
						}
						seen[a.model[d]] = true
					}
					c, _, ok := a.eval(d, append(append([][]int(nil), s.Routes[d]...), trip), nil)
					if !ok {
						continue
					}
					delta := srcC + c - s.VCost[k] - s.VCost[d]
					if delta < -1e-6 && (bestD < 0 || delta < bestDelta) {
						bestD, bestDelta = d, delta
					}
				}
				if bestD >= 0 {
					s.Routes[k] = rest
					s.Routes[bestD] = append(s.Routes[bestD], trip)
					a.refresh(s, k)
					a.refresh(s, bestD)
					moved = true
					break
				}
			}
		}
		if !moved {
			break
		}
	}
	return s
}

func (a *ALNS) destroy(name string, s *Solution, n int) []int {
	switch name {
	case "random":
		return a.destroyRandom(s, n)
	case "shaw":
		return a.destroyShaw(s, n)
	case "worst":
		return a.destroyWorst(s, n)
	default:
		return a.destroyDistrict(s)
	}
}

func (a *ALNS) destroyRandom(s *Solution, n int) []int {
	order, where := a.locate(s)
	pool := append([]int(nil), order...)
	n = min(n, len(pool))
	chosen := make([]int, 0, n)
	for j := 0; j < n; j++ { // rng.sample: partial Fisher–Yates
		r := j + a.rng.IntN(len(pool)-j)
		pool[j], pool[r] = pool[r], pool[j]
		chosen = append(chosen, pool[j])
	}
	for _, i := range chosen {
		a.remove(s, i, where)
	}
	return chosen
}

func (a *ALNS) relatedness(i, j int, where map[int]loc) float64 {
	x, y, p := a.O[i], a.O[j], a.p
	r := p.ShawTime*math.Abs(x.E-y.E)/1440 + p.ShawVolume*math.Abs(x.V-y.V)/a.maxV
	if x.District != y.District {
		r += p.ShawDistrict
	}
	if x.Brand != y.Brand {
		r += p.ShawBrand
	}
	if where[i] != where[j] {
		r++
	}
	return r
}

func (a *ALNS) destroyShaw(s *Solution, n int) []int {
	order, where := a.locate(s)
	if len(order) == 0 {
		return nil
	}
	static := make(map[int]loc, len(where))
	for i, l := range where {
		static[i] = l
	}
	first := order[a.rng.IntN(len(order))]
	removed := []int{first}
	var left []int
	for _, i := range order {
		if i != first {
			left = append(left, i)
		}
	}
	for len(removed) < n && len(left) > 0 {
		r := removed[a.rng.IntN(len(removed))]
		sort.SliceStable(left, func(x, y int) bool {
			return a.relatedness(r, left[x], static) < a.relatedness(r, left[y], static)
		})
		idx := int(math.Pow(a.rng.Float64(), a.p.ShawP) * float64(len(left)))
		removed = append(removed, left[idx])
		left = append(left[:idx:idx], left[idx+1:]...)
	}
	for _, i := range removed {
		a.remove(s, i, where)
	}
	return removed
}

func (a *ALNS) destroyWorst(s *Solution, n int) []int {
	order, where := a.locate(s)
	saving := make(map[int]float64, len(order))
	for _, i := range order {
		l := where[i]
		var trips [][]int
		for j, t := range s.Routes[l.k] {
			if j == l.ti {
				var nt []int
				for _, x := range t {
					if x != i {
						nt = append(nt, x)
					}
				}
				t = nt
			}
			if len(t) > 0 {
				trips = append(trips, t)
			}
		}
		c, _, _ := a.eval(l.k, trips, nil)
		saving[i] = s.VCost[l.k] - c
	}
	ranked := append([]int(nil), order...)
	sort.SliceStable(ranked, func(x, y int) bool { return saving[ranked[x]] > saving[ranked[y]] })
	var chosen []int
	for len(ranked) > 0 && len(chosen) < n {
		idx := int(math.Pow(a.rng.Float64(), a.p.WorstP) * float64(len(ranked)))
		chosen = append(chosen, ranked[idx])
		ranked = append(ranked[:idx:idx], ranked[idx+1:]...)
	}
	for _, i := range chosen {
		a.remove(s, i, where)
	}
	return chosen
}

func (a *ALNS) destroyDistrict(s *Solution) []int {
	order, where := a.locate(s)
	if len(order) == 0 {
		return nil
	}
	o := a.O[order[a.rng.IntN(len(order))]]
	var chosen []int
	for _, i := range order {
		x := a.O[i]
		if x.Depot == o.Depot && x.District == o.District && x.Brand == o.Brand {
			chosen = append(chosen, i)
		}
	}
	for _, i := range chosen {
		a.remove(s, i, where)
	}
	return chosen
}

func (a *ALNS) roulette(names []string, w map[string]float64) string {
	total := 0.0
	for _, n := range names {
		total += w[n]
	}
	x := a.rng.Float64() * total
	for _, n := range names {
		x -= w[n]
		if x <= 0 {
			return n
		}
	}
	return names[len(names)-1]
}

// Run returns the best solution found. The initial solution is regret insertion without right-sizing,
// exactly as in the notebook.
func (a *ALNS) Run() *Solution {
	p := a.p
	all := make([]int, len(a.O))
	for i := range all {
		all[i] = i
	}
	cur := a.repairRegret(newSolution(len(a.V)), all)
	curC := a.cost(cur)
	best, bestC := cur, curC
	sumV := 0.0
	for _, c := range cur.VCost {
		sumV += c
	}
	T := math.Max(p.StartTempFrac*math.Max(sumV, 1)/math.Ln2, 1e-6)
	wd, wr := map[string]float64{}, map[string]float64{}
	sd, sr := map[string]float64{}, map[string]float64{}
	cd, cr := map[string]int{}, map[string]int{}
	for _, n := range a.destroyNames {
		wd[n] = 1
	}
	for _, n := range a.repairNames {
		wr[n] = 1
	}
	nAssigned := len(a.O) - len(cur.U)
	for it := 1; it <= p.Iterations; it++ {
		dOp, rOp := a.roulette(a.destroyNames, wd), a.roulette(a.repairNames, wr)
		hi := max(p.MinRemove, min(p.MaxRemove, int(p.MaxRemoveFrac*float64(max(nAssigned, 1)))))
		nRemove := p.MinRemove + a.rng.IntN(hi-p.MinRemove+1)
		cand := cur.copy()
		removed := a.destroy(dOp, cand, nRemove)
		pool := append(removed, cand.Unassigned()...)
		cand.U = map[int]struct{}{}
		a.repair(rOp, cand, pool)
		candC := a.cost(cand)

		delta := candC - curC
		var score float64
		if delta < -1e-9 || a.rng.Float64() < math.Exp(-delta/T) {
			cur, curC = cand, candC
			nAssigned = len(a.O) - len(cur.U)
			switch {
			case candC < bestC-1e-9:
				best, bestC, score = cand, candC, p.Sigma1
			case delta < -1e-9:
				score = p.Sigma2
			default:
				score = p.Sigma3
			}
		}
		sd[dOp] += score
		sr[rOp] += score
		cd[dOp]++
		cr[rOp]++
		if it%p.SegmentLength == 0 {
			for _, n := range a.destroyNames {
				if cd[n] > 0 {
					wd[n] = (1-p.ReactionFactor)*wd[n] + p.ReactionFactor*sd[n]/float64(cd[n])
					sd[n], cd[n] = 0, 0
				}
			}
			for _, n := range a.repairNames {
				if cr[n] > 0 {
					wr[n] = (1-p.ReactionFactor)*wr[n] + p.ReactionFactor*sr[n]/float64(cr[n])
					sr[n], cr[n] = 0, 0
				}
			}
		}
		T *= p.CoolingRate
	}
	a.Weights = map[string]map[string]float64{"destroy": wd, "repair": wr}
	return best
}

// PlanCost is the objective without the lost-second-trip term (the notebook's plan_cost).
func (a *ALNS) PlanCost(s *Solution) float64 {
	total := 0.0
	for _, i := range s.Unassigned() {
		total += a.pen[i]
	}
	for k, trips := range s.Routes {
		if len(trips) > 0 {
			c, _, _ := a.evalBase(k, trips, nil)
			total += c
		}
	}
	return total
}

// PlannedTrip is one trip of a solved vehicle, in the day's running order.
type PlannedTrip struct {
	Vehicle    int
	TripNumber int // 1 or 2
	Orders     []int
	Arrival    map[int]float64 // minutes after midnight
	Departure  float64
	Return     float64
	Minutes    float64 // booklet trip time: outbound + inter-stop + handling
	Km         float64
}

// Trips expands a solution into trips with the timing eval_vehicle computes.
func (a *ALNS) Trips(s *Solution) []PlannedTrip {
	var out []PlannedTrip
	for k, trips := range s.Routes {
		if len(trips) == 0 {
			continue
		}
		arr := map[int]float64{}
		a.eval(k, trips, func(i int, t float64) { arr[i] = t })
		clock, haveClock := 0.0, false
		for n, trip := range a.schedule(trips) {
			o := a.O[trip[0]]
			d := a.tr[o.District]
			start := a.p.OtherStart
			if o.Brand == "Fresh" {
				start = a.p.FreshStart
			}
			if haveClock {
				start = math.Max(start, clock+a.p.ReloadMin)
			}
			last := a.O[trip[len(trip)-1]]
			end := math.Max(arr[trip[len(trip)-1]], last.E) + last.S + d.DepotMin
			clock, haveClock = end, true
			ta := map[int]float64{}
			for _, i := range trip {
				ta[i] = arr[i]
			}
			out = append(out, PlannedTrip{Vehicle: k, TripNumber: n + 1, Orders: trip, Arrival: ta,
				Departure: start, Return: end, Minutes: a.tripMinutes(trip), Km: a.tripKm(trip)})
		}
	}
	return out
}
