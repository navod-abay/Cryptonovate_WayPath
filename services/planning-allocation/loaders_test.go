package main

import (
	"context"
	"fmt"
	"testing"
	"time"
)

func TestAssignLoadersSharesVehiclesEqually(t *testing.T) {
	trip := func(depot, veh string, n int, departure string) TripDetail {
		return TripDetail{Trip: Trip{TripID: veh + fmt.Sprint(n), TripNumber: n, DepartureTime: departure}, Depot: depot, VehicleID: veh}
	}
	trips := []TripDetail{
		trip("Peliyagoda", "VEH005", 1, "05:00"), trip("Peliyagoda", "VEH005", 2, "09:10"),
		trip("Peliyagoda", "VEH001", 1, "03:30"), trip("Peliyagoda", "VEH002", 1, "03:30"),
		trip("Peliyagoda", "VEH003", 1, "04:00"), trip("Peliyagoda", "VEH004", 1, "06:15"),
		trip("Peliyagoda", "VEH006", 1, "07:00"), trip("Peliyagoda", "VEH007", 1, "07:00"),
		trip("Kandy", "VEH050", 1, "03:30"),
	}
	loaders := []Loader{
		{ID: "c", Username: "loader_peliyagoda_3", Depot: "Peliyagoda"},
		{ID: "a", Username: "loader_peliyagoda", Depot: "Peliyagoda"},
		{ID: "b", Username: "loader_peliyagoda_2", Depot: "peliyagoda"}, // depot names are matched like the API does
	}
	unstaffed := assignLoaders(trips, loaders)
	if fmt.Sprint(unstaffed) != "[Kandy]" {
		t.Errorf("unstaffed depots = %v, want [Kandy]", unstaffed)
	}
	got := map[string]string{}
	for _, tr := range trips {
		if prev, ok := got[tr.VehicleID]; ok && prev != tr.LoaderID {
			t.Errorf("%s's trips have loaders %s and %s; want one loader per vehicle", tr.VehicleID, prev, tr.LoaderID)
		}
		got[tr.VehicleID] = tr.LoaderID
	}
	// By first departure (then id): VEH001, VEH002, VEH003, VEH005, VEH004, VEH006, VEH007, dealt a, b, c.
	want := map[string]string{"VEH001": "a", "VEH002": "b", "VEH003": "c", "VEH005": "a", "VEH004": "b",
		"VEH006": "c", "VEH007": "a", "VEH050": ""}
	if fmt.Sprint(got) != fmt.Sprint(want) {
		t.Errorf("assignment = %v\nwant %v", got, want)
	}
}

type fakeLoaders []Loader

func (f fakeLoaders) Loaders(context.Context) ([]Loader, error) { return f, nil }

func TestPlannerAssignsEveryTripToALoader(t *testing.T) {
	orders, fleet := task2bAPIs(t)
	params := DefaultALNSParams()
	params.Iterations = 50
	store := newMemStore()
	loaders := fakeLoaders{{ID: "p1", Username: "lp1", FullName: "P One", Depot: "Peliyagoda"},
		{ID: "p2", Username: "lp2", FullName: "P Two", Depot: "Peliyagoda"}, {ID: "k1", Username: "lk1", FullName: "K One", Depot: "Kandy"}}
	p := &ALNSPlanner{orders: orders, fleet: fleet, loaders: loaders, store: store, params: params, seeds: 1}
	if _, err := p.Plan(context.Background(), "run_l", "manual", time.Date(2026, 10, 5, 0, 0, 0, 0, sriLanka)); err != nil {
		t.Fatal(err)
	}
	vehicles := map[string]map[string]bool{} // loader -> vehicles
	for _, tr := range store.plans["run_l"].Trips {
		if tr.LoaderID == "" || tr.LoaderName == "" {
			t.Fatalf("trip %s has no loader", tr.TripID)
		}
		if (tr.Depot == "Kandy") != (tr.LoaderID == "k1") {
			t.Errorf("trip %s at %s went to loader %s of another depot", tr.TripID, tr.Depot, tr.LoaderID)
		}
		if vehicles[tr.LoaderID] == nil {
			vehicles[tr.LoaderID] = map[string]bool{}
		}
		vehicles[tr.LoaderID][tr.VehicleID] = true
	}
	if d := len(vehicles["p1"]) - len(vehicles["p2"]); d < 0 || d > 1 {
		t.Errorf("Peliyagoda loaders got %d and %d vehicles; want an equal share", len(vehicles["p1"]), len(vehicles["p2"]))
	}
}
