package main

import (
	"context"
	"time"
)

// ScheduleStore reads planned schedules and deferrals. The stub below returns sample data;
// a Postgres implementation (DATABASE_URL) replaces it once the planning tables exist.
type ScheduleStore interface {
	FleetSize(ctx context.Context, depot string) (int, error)
	DepotSchedule(ctx context.Context, date time.Time, depot string) (DepotSchedule, error)
	DeferredOrders(ctx context.Context, date time.Time, depot string) ([]DeferredOrder, error) // depot "" = all
}

type stubStore struct{}

func (stubStore) FleetSize(_ context.Context, depot string) (int, error) {
	return map[string]int{"Peliyagoda": 38, "Kandy": 22}[depot], nil
}

func (stubStore) DepotSchedule(_ context.Context, date time.Time, depot string) (DepotSchedule, error) {
	s := DepotSchedule{Date: date.Format(dateLayout), Depot: depot, PlanRunID: "stub", Vehicles: []VehicleSchedule{}}
	switch depot {
	case "Peliyagoda":
		s.Vehicles = []VehicleSchedule{
			{VehicleID: "VEH003", Type: "truck", Temperature: "reefer", WeightCapacityKg: 5510, VolumeCapacityM3: 26.4,
				Trips: []Trip{
					sampleTrip("VEH003", 1, "Fresh", "Colombo", "03:30", "05:42", 108, 40, 8.5, 5510, 26.4, []Stop{
						{1, "S1-007", "OUT004", "Fresh", "chilled", 568, 2.92, "03:54", "05:30", "08:00"},
						{2, "S1-014", "OUT008", "Fresh", "chilled", 714, 4.0, "04:18", "05:00", "07:30"},
					}),
				}},
			{VehicleID: "VEH018", Type: "truck", Temperature: "ambient", WeightCapacityKg: 4200, VolumeCapacityM3: 24,
				Trips: []Trip{
					sampleTrip("VEH018", 1, "Style", "Gampaha", "08:00", "10:31", 151, 56, 8.2, 4200, 24, []Stop{
						{1, "S1-036", "OUT035", "Style", "ambient", 912, 11.4, "08:37", "10:30", "12:30"},
					}),
				}},
		}
	case "Kandy":
		s.Vehicles = []VehicleSchedule{
			{VehicleID: "VEH057", Type: "van", Temperature: "reefer", WeightCapacityKg: 1040, VolumeCapacityM3: 7,
				Trips: []Trip{
					sampleTrip("VEH057", 1, "Fresh", "Kandy", "03:30", "04:35", 65, 22, 2.1, 1040, 7, []Stop{
						{1, "K-001", "OUT077", "Fresh", "chilled", 104, 0.55, "03:46", "05:00", "07:30"},
						{2, "K-002", "OUT079", "Fresh", "chilled", 96, 0.51, "03:52", "05:30", "08:00"},
					}),
				}},
		}
	}
	return s, nil
}

func (stubStore) DeferredOrders(_ context.Context, date time.Time, depot string) ([]DeferredOrder, error) {
	all := []DeferredOrder{
		{OrderRef: "S1-058", OutletID: "OUT054", Depot: "Peliyagoda", District: "Galle", Brand: "Fresh",
			Temperature: "chilled", WeightKg: 2742, VolumeM3: 16.52, OrderDate: date.Format(dateLayout), TimesDeferred: 0,
			Reason:       ReasonNoReeferCapacity,
			ReasonDetail: "All available reefers are fully booked within the 270-minute Fresh window."},
		{OrderRef: "S1-078", OutletID: "OUT070", Depot: "Peliyagoda", District: "Kurunegala", Brand: "Style",
			Temperature: "ambient", WeightKg: 2562, VolumeM3: 40.66, OrderDate: date.Format(dateLayout), TimesDeferred: 0,
			Reason:       ReasonExceedsLargestVehicle,
			ReasonDetail: "40.66 m³ is larger than the largest vehicle (38 m³); orders cannot be split."},
	}
	if depot == "" {
		return all, nil
	}
	out := []DeferredOrder{}
	for _, o := range all {
		if o.Depot == depot {
			out = append(out, o)
		}
	}
	return out, nil
}

func sampleTrip(veh string, n int, brand, district, dep, ret string, minutes int, km, litres, capKg, capM3 float64, stops []Stop) Trip {
	t := Trip{TripID: tripID(veh, n), TripNumber: n, Brand: brand, District: district, DepartureTime: dep,
		ReturnTime: ret, DurationMin: minutes, DistanceKm: km, FuelLitres: litres, Stops: stops}
	for _, s := range stops {
		t.WeightKg += s.WeightKg
		t.VolumeM3 += s.VolumeM3
	}
	t.WeightUtilization = round(t.WeightKg/capKg, 4)
	t.VolumeUtilization = round(t.VolumeM3/capM3, 4)
	return t
}
