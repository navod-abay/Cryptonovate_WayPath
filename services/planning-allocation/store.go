package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ScheduleStore reads the plan of a date's completed run.
type ScheduleStore interface {
	FleetSize(ctx context.Context, date time.Time, depot string) (int, error)
	DepotSchedule(ctx context.Context, date time.Time, depot string) (DepotSchedule, error)
	DeferredOrders(ctx context.Context, date time.Time, depot string) ([]DeferredOrder, error) // depot "" = all
	Trip(ctx context.Context, tripID string) (*TripDetail, error)                              // nil = not found
	Trips(ctx context.Context, date time.Time, depot, vehicleID string) ([]TripDetail, error)  // "" = any
}

// planningTables are created by infrastructure/postgres-init/03-planning.sql.
var planningTables = []string{"planning_runs", "planned_trips", "planned_stops", "planned_stop_items", "planned_deferrals"}

type pgStore struct{ db *pgxpool.Pool }

// AssertSchema fails with a fix-it message when the planning tables were never created, which happens
// when the database volume predates 03-planning.sql (init scripts only run on an empty volume).
func (s *pgStore) AssertSchema(ctx context.Context) error {
	var missing []string
	for _, t := range planningTables {
		var ok bool
		if err := s.db.QueryRow(ctx, "SELECT to_regclass($1) IS NOT NULL", t).Scan(&ok); err != nil {
			return err
		}
		if !ok {
			missing = append(missing, t)
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("missing table(s): %s. The planning migration has not been applied to this database; "+
			"apply it with: docker compose exec -T postgres psql -U postgres -d delivery_db < infrastructure/postgres-init/03-planning.sql",
			strings.Join(missing, ", "))
	}
	return nil
}

// ---------------------------------------------------------------- schedule reads

const tripColumns = `t.trip_id, t.run_id, to_char(t.plan_date, 'YYYY-MM-DD'), t.depot, t.vehicle_id, t.vehicle_type,
	t.vehicle_temp, t.weight_cap_kg::float8, t.volume_cap_m3::float8, t.trip_number, t.brand, t.district,
	t.departure_time, t.return_time, t.duration_min, t.distance_km::float8, t.fuel_litres::float8,
	t.weight_kg::float8, t.volume_m3::float8, t.weight_utilization::float8, t.volume_utilization::float8`

// queryTrips loads trips of completed runs matching where (with args), plus their stops and,
// optionally, the stop items.
func (s *pgStore) queryTrips(ctx context.Context, withItems bool, where string, args ...any) ([]TripDetail, error) {
	rows, err := s.db.Query(ctx, `SELECT `+tripColumns+` FROM planned_trips t
		JOIN planning_runs r ON r.run_id = t.run_id AND r.status = 'COMPLETED'
		WHERE `+where+` ORDER BY t.vehicle_id, t.trip_number`, args...)
	if err != nil {
		return nil, err
	}
	trips, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (TripDetail, error) {
		var t TripDetail
		err := row.Scan(&t.TripID, &t.PlanRunID, &t.PlanDate, &t.Depot, &t.VehicleID, &t.VehicleType, &t.VehicleTemp,
			&t.WeightCapacityKg, &t.VolumeCapacityM3, &t.TripNumber, &t.Brand, &t.District, &t.DepartureTime,
			&t.ReturnTime, &t.DurationMin, &t.DistanceKm, &t.FuelLitres, &t.WeightKg, &t.VolumeM3,
			&t.WeightUtilization, &t.VolumeUtilization)
		t.Stops = []Stop{}
		return t, err
	})
	if err != nil || len(trips) == 0 {
		return trips, err
	}
	ids := make([]string, len(trips))
	byID := make(map[string]*TripDetail, len(trips))
	for n := range trips {
		ids[n] = trips[n].TripID
		byID[trips[n].TripID] = &trips[n]
	}
	rows, err = s.db.Query(ctx, `SELECT trip_id, stop_id, sequence, order_ref, outlet_id, brand, temperature,
		weight_kg::float8, volume_m3::float8, eta, window_open, window_close, late_min::float8
		FROM planned_stops WHERE trip_id = ANY($1) ORDER BY trip_id, sequence`, ids)
	if err != nil {
		return nil, err
	}
	stopTrip := map[string]*TripDetail{}
	var stopIDs []string
	for rows.Next() {
		var tripID string
		var st Stop
		if err := rows.Scan(&tripID, &st.StopID, &st.Sequence, &st.OrderRef, &st.OutletID, &st.Brand, &st.Temperature,
			&st.WeightKg, &st.VolumeM3, &st.ETA, &st.WindowOpen, &st.WindowClose, &st.LateMin); err != nil {
			rows.Close()
			return nil, err
		}
		t := byID[tripID]
		t.Stops = append(t.Stops, st)
		stopTrip[st.StopID] = t
		stopIDs = append(stopIDs, st.StopID)
	}
	rows.Close()
	if err := rows.Err(); err != nil || !withItems {
		return trips, err
	}
	rows, err = s.db.Query(ctx, `SELECT stop_id, sku, description, quantity FROM planned_stop_items
		WHERE stop_id = ANY($1) ORDER BY stop_id, line_no`, stopIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var stopID string
		var it StopItem
		if err := rows.Scan(&stopID, &it.SKU, &it.Description, &it.Qty); err != nil {
			return nil, err
		}
		t := stopTrip[stopID]
		for n := range t.Stops {
			if t.Stops[n].StopID == stopID {
				t.Stops[n].Items = append(t.Stops[n].Items, it)
			}
		}
	}
	for n := range trips {
		for m := range trips[n].Stops {
			if trips[n].Stops[m].Items == nil {
				trips[n].Stops[m].Items = []StopItem{}
			}
		}
	}
	return trips, rows.Err()
}

func (s *pgStore) completedRun(ctx context.Context, date time.Time) (runID string, fleet map[string]int, err error) {
	var raw []byte
	err = s.db.QueryRow(ctx, `SELECT run_id, fleet_available FROM planning_runs
		WHERE plan_date = $1 AND status = 'COMPLETED'`, date.Format(dateLayout)).Scan(&runID, &raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil, nil
	}
	if err == nil && len(raw) > 0 {
		err = json.Unmarshal(raw, &fleet)
	}
	return runID, fleet, err
}

func (s *pgStore) FleetSize(ctx context.Context, date time.Time, depot string) (int, error) {
	_, fleet, err := s.completedRun(ctx, date)
	return fleet[depot], err
}

func (s *pgStore) DepotSchedule(ctx context.Context, date time.Time, depot string) (DepotSchedule, error) {
	out := DepotSchedule{Date: date.Format(dateLayout), Depot: depot, Vehicles: []VehicleSchedule{}}
	trips, err := s.queryTrips(ctx, false, "t.plan_date = $1 AND t.depot = $2", out.Date, depot)
	if err != nil {
		return out, err
	}
	for _, t := range trips {
		out.PlanRunID = t.PlanRunID
		n := len(out.Vehicles)
		if n == 0 || out.Vehicles[n-1].VehicleID != t.VehicleID {
			out.Vehicles = append(out.Vehicles, VehicleSchedule{VehicleID: t.VehicleID, Type: t.VehicleType,
				Temperature: t.VehicleTemp, WeightCapacityKg: t.WeightCapacityKg, VolumeCapacityM3: t.VolumeCapacityM3})
			n++
		}
		out.Vehicles[n-1].Trips = append(out.Vehicles[n-1].Trips, t.Trip)
	}
	if out.PlanRunID == "" {
		out.PlanRunID, _, err = s.completedRun(ctx, date)
	}
	return out, err
}

func (s *pgStore) DeferredOrders(ctx context.Context, date time.Time, depot string) ([]DeferredOrder, error) {
	rows, err := s.db.Query(ctx, `SELECT d.order_ref, d.outlet_id, d.depot, d.district, d.brand, d.temperature,
		d.weight_kg::float8, d.volume_m3::float8, to_char(d.order_date, 'YYYY-MM-DD'), d.times_deferred,
		d.reason_code, d.reason_detail
		FROM planned_deferrals d JOIN planning_runs r ON r.run_id = d.run_id AND r.status = 'COMPLETED'
		WHERE r.plan_date = $1 AND ($2 = '' OR d.depot = $2)
		ORDER BY d.times_deferred DESC, d.order_ref`, date.Format(dateLayout), depot)
	if err != nil {
		return nil, err
	}
	out, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (DeferredOrder, error) {
		var d DeferredOrder
		err := row.Scan(&d.OrderRef, &d.OutletID, &d.Depot, &d.District, &d.Brand, &d.Temperature, &d.WeightKg,
			&d.VolumeM3, &d.OrderDate, &d.TimesDeferred, &d.Reason, &d.ReasonDetail)
		return d, err
	})
	if out == nil {
		out = []DeferredOrder{}
	}
	return out, err
}

func (s *pgStore) Trip(ctx context.Context, tripID string) (*TripDetail, error) {
	trips, err := s.queryTrips(ctx, true, "t.trip_id = $1", tripID)
	if err != nil || len(trips) == 0 {
		return nil, err
	}
	return &trips[0], nil
}

func (s *pgStore) Trips(ctx context.Context, date time.Time, depot, vehicleID string) ([]TripDetail, error) {
	trips, err := s.queryTrips(ctx, true, "t.plan_date = $1 AND ($2 = '' OR t.depot = $2) AND ($3 = '' OR t.vehicle_id = $3)",
		date.Format(dateLayout), depot, vehicleID)
	if trips == nil {
		trips = []TripDetail{}
	}
	return trips, err
}

// ---------------------------------------------------------------- planning runs

const runColumns = `run_id, to_char(plan_date, 'YYYY-MM-DD'), status, trigger,
	to_char(requested_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
	COALESCE(to_char(started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), ''),
	COALESCE(to_char(finished_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), ''),
	COALESCE(error, ''), stats`

func scanRun(row pgx.Row) (PlanningRun, error) {
	var r PlanningRun
	var stats []byte
	err := row.Scan(&r.RunID, &r.PlanDate, &r.Status, &r.Trigger, &r.RequestedAt, &r.StartedAt, &r.FinishedAt, &r.Error, &stats)
	if err == nil && len(stats) > 0 {
		r.Stats = &RunStats{}
		err = json.Unmarshal(stats, r.Stats)
	}
	return r, err
}

func (s *pgStore) CreateRun(ctx context.Context, run PlanningRun) (PlanningRun, bool, error) {
	tag, err := s.db.Exec(ctx, `INSERT INTO planning_runs (run_id, plan_date, status, trigger, requested_at)
		VALUES ($1, $2, $3, $4, $5::timestamptz)
		ON CONFLICT (plan_date) WHERE status <> 'FAILED' DO NOTHING`,
		run.RunID, run.PlanDate, run.Status, run.Trigger, run.RequestedAt)
	if err != nil {
		return PlanningRun{}, false, err
	}
	if tag.RowsAffected() == 1 {
		return run, true, nil
	}
	existing, err := s.BlockingRun(ctx, run.PlanDate)
	if err != nil || existing == nil {
		return PlanningRun{}, false, errors.Join(err, errors.New("run conflict without a blocking run"))
	}
	return *existing, false, nil
}

func (s *pgStore) UpdateRun(ctx context.Context, run PlanningRun) error {
	var stats []byte
	if run.Stats != nil {
		stats, _ = json.Marshal(run.Stats)
	}
	_, err := s.db.Exec(ctx, `UPDATE planning_runs SET status = $2,
		started_at = NULLIF($3, '')::timestamptz, finished_at = NULLIF($4, '')::timestamptz,
		error = NULLIF($5, ''), stats = $6 WHERE run_id = $1`,
		run.RunID, run.Status, run.StartedAt, run.FinishedAt, run.Error, stats)
	return err
}

func (s *pgStore) GetRun(ctx context.Context, id string) (PlanningRun, bool, error) {
	r, err := scanRun(s.db.QueryRow(ctx, `SELECT `+runColumns+` FROM planning_runs WHERE run_id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return PlanningRun{}, false, nil
	}
	return r, err == nil, err
}

func (s *pgStore) ListRuns(ctx context.Context, planDate string) ([]PlanningRun, error) {
	rows, err := s.db.Query(ctx, `SELECT `+runColumns+` FROM planning_runs WHERE plan_date = $1 ORDER BY requested_at DESC`, planDate)
	if err != nil {
		return nil, err
	}
	out, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (PlanningRun, error) { return scanRun(row) })
	if out == nil {
		out = []PlanningRun{}
	}
	return out, err
}

func (s *pgStore) BlockingRun(ctx context.Context, planDate string) (*PlanningRun, error) {
	r, err := scanRun(s.db.QueryRow(ctx, `SELECT `+runColumns+` FROM planning_runs
		WHERE plan_date = $1 AND status <> 'FAILED'`, planDate))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &r, nil
}

func (s *pgStore) CountFailedRuns(ctx context.Context, planDate, trigger string) (int, error) {
	var n int
	err := s.db.QueryRow(ctx, `SELECT count(*) FROM planning_runs WHERE plan_date = $1 AND trigger = $2 AND status = 'FAILED'`,
		planDate, trigger).Scan(&n)
	return n, err
}

func (s *pgStore) FailInterruptedRuns(ctx context.Context) (int, error) {
	var n int
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `UPDATE planning_runs SET status = 'FAILED', finished_at = now(),
			error = 'interrupted by a service restart' WHERE status IN ('QUEUED', 'RUNNING') RETURNING run_id`)
		if err != nil {
			return err
		}
		ids, err := pgx.CollectRows(rows, pgx.RowTo[string])
		if err != nil {
			return err
		}
		n = len(ids)
		for _, id := range ids {
			if err := discardPlan(ctx, tx, id); err != nil {
				return err
			}
		}
		return nil
	})
	return n, err
}

// ---------------------------------------------------------------- plan writes

func (s *pgStore) SavePlan(ctx context.Context, runID string, planDate time.Time, plan *Plan) error {
	return pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		fleet, _ := json.Marshal(plan.FleetAvailable)
		if _, err := tx.Exec(ctx, `UPDATE planning_runs SET fleet_available = $2 WHERE run_id = $1`, runID, fleet); err != nil {
			return err
		}
		var trips, stops, items, deferrals [][]any
		for _, t := range plan.Trips {
			trips = append(trips, []any{t.TripID, runID, planDate, t.Depot, t.VehicleID, t.VehicleType, t.VehicleTemp,
				t.WeightCapacityKg, t.VolumeCapacityM3, t.TripNumber, t.Brand, t.District, t.DepartureTime, t.ReturnTime,
				t.DurationMin, t.DistanceKm, t.FuelLitres, t.WeightKg, t.VolumeM3, t.WeightUtilization, t.VolumeUtilization})
			for _, st := range t.Stops {
				stops = append(stops, []any{st.StopID, t.TripID, st.Sequence, st.OrderRef, st.OutletID, st.Brand,
					st.Temperature, st.WeightKg, st.VolumeM3, st.ETA, st.WindowOpen, st.WindowClose, st.LateMin})
				for n, it := range st.Items {
					items = append(items, []any{st.StopID, n + 1, it.SKU, it.Description, it.Qty})
				}
			}
		}
		for _, d := range plan.Deferrals {
			orderDate, err := time.Parse(dateLayout, d.OrderDate)
			if err != nil {
				return fmt.Errorf("deferral %s: order date %q: %w", d.OrderRef, d.OrderDate, err)
			}
			deferrals = append(deferrals, []any{runID, d.OrderRef, d.OutletID, d.Depot, d.District, d.Brand,
				d.Temperature, d.WeightKg, d.VolumeM3, orderDate, d.TimesDeferred, string(d.Reason), d.ReasonDetail})
		}
		copies := []struct {
			table string
			cols  []string
			rows  [][]any
		}{
			{"planned_trips", []string{"trip_id", "run_id", "plan_date", "depot", "vehicle_id", "vehicle_type", "vehicle_temp",
				"weight_cap_kg", "volume_cap_m3", "trip_number", "brand", "district", "departure_time", "return_time",
				"duration_min", "distance_km", "fuel_litres", "weight_kg", "volume_m3", "weight_utilization", "volume_utilization"}, trips},
			{"planned_stops", []string{"stop_id", "trip_id", "sequence", "order_ref", "outlet_id", "brand", "temperature",
				"weight_kg", "volume_m3", "eta", "window_open", "window_close", "late_min"}, stops},
			{"planned_stop_items", []string{"stop_id", "line_no", "sku", "description", "quantity"}, items},
			{"planned_deferrals", []string{"run_id", "order_ref", "outlet_id", "depot", "district", "brand", "temperature",
				"weight_kg", "volume_m3", "order_date", "times_deferred", "reason_code", "reason_detail"}, deferrals},
		}
		for _, c := range copies {
			if len(c.rows) == 0 {
				continue
			}
			if _, err := tx.CopyFrom(ctx, pgx.Identifier{c.table}, c.cols, pgx.CopyFromRows(c.rows)); err != nil {
				return fmt.Errorf("%s: %w", c.table, err)
			}
		}
		return nil
	})
}

func (s *pgStore) DiscardPlan(ctx context.Context, runID string) error {
	return pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error { return discardPlan(ctx, tx, runID) })
}

func discardPlan(ctx context.Context, tx pgx.Tx, runID string) error {
	// Stops and items go with their trips (ON DELETE CASCADE).
	if _, err := tx.Exec(ctx, `DELETE FROM planned_trips WHERE run_id = $1`, runID); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `DELETE FROM planned_deferrals WHERE run_id = $1`, runID)
	return err
}
