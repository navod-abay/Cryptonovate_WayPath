package main

import (
	"fmt"
	"sort"
)

// CheckRules validates a plan against booklet rules 1–7 (the notebook's cell-23 checker).
// It returns one message per violation; an empty result means the plan may be published.
func CheckRules(a *ALNS, trips []PlannedTrip) []string {
	var v []string
	seen := map[int]bool{}
	byVehicle := map[int][]PlannedTrip{}
	for _, t := range trips {
		car := a.V[t.Vehicle]
		tag := fmt.Sprintf("%s trip %d", car.ID, t.TripNumber)
		byVehicle[t.Vehicle] = append(byVehicle[t.Vehicle], t)
		first := a.O[t.Orders[0]]
		var w, vol float64
		for _, i := range t.Orders {
			o := a.O[i]
			if seen[i] {
				v = append(v, fmt.Sprintf("rule 5: order %s is assigned more than once", o.ID))
			}
			seen[i] = true
			if o.Brand != first.Brand || o.District != first.District {
				v = append(v, fmt.Sprintf("rule 1: %s mixes brands or districts", tag))
			}
			if o.Chilled && car.Temp != "reefer" {
				v = append(v, fmt.Sprintf("rule 2: %s carries chilled order %s on an ambient vehicle", tag, o.ID))
			}
			if o.Chilled != first.Chilled {
				v = append(v, fmt.Sprintf("rule 2: %s mixes chilled and ambient orders", tag))
			}
			if o.VanOnly && car.Type != "van" {
				v = append(v, fmt.Sprintf("rule 3: %s serves van-only outlet %s with a %s", tag, o.Outlet, car.Type))
			}
			if o.Depot != car.Depot {
				v = append(v, fmt.Sprintf("rule 4: %s serves another depot's outlet %s", tag, o.Outlet))
			}
			w += o.W
			vol += o.V
		}
		if w > car.W+1e-9 || vol > car.V+1e-9 {
			v = append(v, fmt.Sprintf("rule 6: %s over capacity (%.0f/%.0f kg, %.2f/%.2f m³)", tag, w, car.W, vol, car.V))
		}
	}
	ks := make([]int, 0, len(byVehicle))
	for k := range byVehicle {
		ks = append(ks, k)
	}
	sort.Ints(ks)
	for _, k := range ks {
		ts := byVehicle[k]
		id := a.V[k].ID
		nums := make([]int, len(ts))
		var freshMin, otherMin float64
		for n, t := range ts {
			nums[n] = t.TripNumber
			if a.O[t.Orders[0]].Brand == "Fresh" {
				freshMin += t.Minutes
			} else {
				otherMin += t.Minutes
			}
		}
		sort.Ints(nums)
		if len(ts) > 2 || !(fmt.Sprint(nums) == "[1]" || fmt.Sprint(nums) == "[1 2]") {
			v = append(v, fmt.Sprintf("rule 7: %s has trips %v", id, nums))
		}
		if freshMin > a.p.FreshBudget+1e-9 {
			v = append(v, fmt.Sprintf("rule 7: %s Fresh trips take %.0f min (budget %.0f)", id, freshMin, a.p.FreshBudget))
		}
		if otherMin > a.p.OtherBudget+1e-9 {
			v = append(v, fmt.Sprintf("rule 7: %s Style/Tech trips take %.0f min (budget %.0f)", id, otherMin, a.p.OtherBudget))
		}
	}
	return v
}
