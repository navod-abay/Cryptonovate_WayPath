package main

import (
	"sort"
)

// assignLoaders shares each depot's vehicles among the depot's loaders once a plan is solved. All
// trips of a vehicle go to the same loader, who loads that truck for the day. Vehicles are dealt
// round-robin in order of first departure (then vehicle id), so every loader gets the same number of
// vehicles, give or take one, spread over the morning rather than bunched together.
//
// It returns the depots that have trips but no loader; their trips stay unassigned.
func assignLoaders(trips []TripDetail, loaders []Loader) []string {
	byDepot := map[string][]Loader{}
	for _, l := range loaders {
		if depot, ok := canonicalDepot(l.Depot); ok {
			byDepot[depot] = append(byDepot[depot], l)
		}
	}
	for _, ls := range byDepot {
		sort.Slice(ls, func(x, y int) bool { return ls[x].Username < ls[y].Username })
	}

	type vehicle struct{ depot, id, firstDeparture string }
	first := map[string]*vehicle{}
	var vehicles []*vehicle
	for _, t := range trips {
		v := first[t.VehicleID]
		if v == nil {
			v = &vehicle{depot: t.Depot, id: t.VehicleID, firstDeparture: t.DepartureTime}
			first[t.VehicleID] = v
			vehicles = append(vehicles, v)
		}
		if t.DepartureTime < v.firstDeparture { // HH:MM sorts as text
			v.firstDeparture = t.DepartureTime
		}
	}
	sort.Slice(vehicles, func(x, y int) bool {
		if vehicles[x].firstDeparture != vehicles[y].firstDeparture {
			return vehicles[x].firstDeparture < vehicles[y].firstDeparture
		}
		return vehicles[x].id < vehicles[y].id
	})

	assigned := map[string]Loader{}
	next := map[string]int{}
	unstaffed := map[string]bool{}
	for _, v := range vehicles {
		ls := byDepot[v.depot]
		if len(ls) == 0 {
			unstaffed[v.depot] = true
			continue
		}
		assigned[v.id] = ls[next[v.depot]%len(ls)]
		next[v.depot]++
	}
	for n := range trips {
		if l, ok := assigned[trips[n].VehicleID]; ok {
			trips[n].LoaderID, trips[n].LoaderName = l.ID, l.FullName
		}
	}
	out := make([]string, 0, len(unstaffed))
	for depot := range unstaffed {
		out = append(out, depot)
	}
	sort.Strings(out)
	return out
}
