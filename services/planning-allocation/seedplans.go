package main

import (
	_ "embed"
	"encoding/csv"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// Seeded plans: the catch-up plans of the demo orders, solved once and kept in seed-data/plans.csv
// (regenerate with scripts/export-seed-plans.sh). Order Management seeds the same orders on every
// fresh database, only on different dates, so a catch-up run replays the stored plan for its pool
// instead of searching for one. Stored plans carry no dates or order refs: a pool is matched to a
// stored day by its orders (outlet, temperature, weight, volume). The replayed plan is re-timed and
// checked like a solved one; if no stored day matches the pool exactly, or the plan no longer fits
// the fleet (a vehicle unavailable, out of range or over a time budget), the run solves as usual.

//go:embed seed-data/plans.csv
var seedPlansCSV string

type seededStop struct {
	vehicle  string // "" = deferred
	trip     int
	sequence int
	order    string // orderKey
}

type seededDay struct {
	day   string
	stops []seededStop
}

func orderKey(outlet string, chilled bool, w, v float64) string {
	temp := "ambient"
	if chilled {
		temp = "chilled"
	}
	return fmt.Sprintf("%s|%s|%.3f|%.4f", outlet, temp, w, v)
}

// parseSeededPlans reads plans.csv: day, vehicle_id, trip_number, sequence, outlet_id, temperature,
// weight_kg, volume_m3 (vehicle_id, trip_number and sequence are empty for a deferred order).
func parseSeededPlans(raw string) ([]seededDay, error) {
	rows, err := csv.NewReader(strings.NewReader(raw)).ReadAll()
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	col := map[string]int{}
	for n, h := range rows[0] {
		col[strings.TrimSpace(h)] = n
	}
	for _, c := range []string{"day", "vehicle_id", "trip_number", "sequence", "outlet_id", "temperature", "weight_kg", "volume_m3"} {
		if _, ok := col[c]; !ok {
			return nil, fmt.Errorf("plans.csv: missing column %s", c)
		}
	}
	var days []seededDay
	byDay := map[string]int{}
	for n, r := range rows[1:] {
		line := n + 2
		w, err1 := strconv.ParseFloat(r[col["weight_kg"]], 64)
		v, err2 := strconv.ParseFloat(r[col["volume_m3"]], 64)
		if err1 != nil || err2 != nil {
			return nil, fmt.Errorf("plans.csv line %d: bad weight or volume", line)
		}
		st := seededStop{vehicle: r[col["vehicle_id"]], order: orderKey(r[col["outlet_id"]], r[col["temperature"]] == "chilled", w, v)}
		if st.vehicle != "" {
			st.trip, err1 = strconv.Atoi(r[col["trip_number"]])
			st.sequence, err2 = strconv.Atoi(r[col["sequence"]])
			if err1 != nil || err2 != nil {
				return nil, fmt.Errorf("plans.csv line %d: bad trip number or sequence", line)
			}
		}
		day := r[col["day"]]
		if _, ok := byDay[day]; !ok {
			byDay[day] = len(days)
			days = append(days, seededDay{day: day})
		}
		days[byDay[day]].stops = append(days[byDay[day]].stops, st)
	}
	return days, nil
}

// replaySeededPlan returns the stored plan for a's orders as a solution, and the stored day it came
// from; nil when no stored day holds exactly these orders or its plan does not fit a's vehicles.
func replaySeededPlan(days []seededDay, a *ALNS) (*Solution, string) {
	if len(a.O) == 0 {
		return nil, ""
	}
	vehicle := make(map[string]int, len(a.V))
	for k, v := range a.V {
		vehicle[v.ID] = k
	}
	for _, d := range days {
		if len(d.stops) != len(a.O) {
			continue
		}
		pool := map[string][]int{}
		for i, o := range a.O {
			key := orderKey(o.Outlet, o.Chilled, o.W, o.V)
			pool[key] = append(pool[key], i)
		}
		type at struct{ trip, sequence, order int }
		routes := map[int][]at{}
		sol := newSolution(len(a.V))
		matched := true
		for _, st := range d.stops {
			idx := pool[st.order]
			if len(idx) == 0 {
				matched = false
				break
			}
			i := idx[0]
			pool[st.order] = idx[1:]
			if st.vehicle == "" {
				sol.U[i] = struct{}{}
				continue
			}
			k, ok := vehicle[st.vehicle]
			if !ok {
				return nil, "" // this is the pool's day, but the vehicle is not available now
			}
			routes[k] = append(routes[k], at{st.trip, st.sequence, i})
		}
		if !matched {
			continue
		}
		for k, stops := range routes {
			sort.Slice(stops, func(x, y int) bool {
				if stops[x].trip != stops[y].trip {
					return stops[x].trip < stops[y].trip
				}
				return stops[x].sequence < stops[y].sequence
			})
			var trips [][]int
			for n, s := range stops {
				if n == 0 || s.trip != stops[n-1].trip {
					trips = append(trips, nil)
				}
				trips[len(trips)-1] = append(trips[len(trips)-1], s.order)
			}
			c, late, ok := a.eval(k, trips, nil)
			if !ok {
				return nil, ""
			}
			sol.Routes[k], sol.VCost[k], sol.Late[k] = trips, c, late
		}
		return sol, d.day
	}
	return nil, ""
}
