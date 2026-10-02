package main

import (
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const dateLayout = "2006-01-02"

// Sri Lanka has no daylight saving; a fixed zone avoids needing tzdata in the Alpine image.
var sriLanka = time.FixedZone("Asia/Colombo", 5*3600+30*60)

var depots = []string{"Peliyagoda", "Kandy"}

type API struct {
	store ScheduleStore
	runs  *RunManager
	now   func() time.Time
}

func (a *API) routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /schedule/summary", a.getSummary)
	mux.HandleFunc("GET /depots/{depot}/schedule", a.getDepotSchedule)
	mux.HandleFunc("GET /schedule/deferrals", a.getDeferrals)
	mux.HandleFunc("POST /planning-runs", a.startPlanning)
}

// GET /schedule/summary?date=YYYY-MM-DD
func (a *API) getSummary(w http.ResponseWriter, r *http.Request) {
	date, err := a.dateParam(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	out := ScheduleSummary{Date: date.Format(dateLayout), Depots: []DepotSummary{}, Totals: DepotSummary{Depot: "ALL"}}
	var capKg, capM3, totCapKg, totCapM3 float64
	for _, depot := range depots {
		sched, err := a.store.DepotSchedule(r.Context(), date, depot)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not load schedule")
			return
		}
		deferred, err := a.store.DeferredOrders(r.Context(), date, depot)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not load deferrals")
			return
		}
		fleet, err := a.store.FleetSize(r.Context(), depot)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not load fleet")
			return
		}
		s := DepotSummary{Depot: depot, VehiclesAvailable: fleet, OrdersDeferred: len(deferred)}
		capKg, capM3 = 0, 0
		for _, v := range sched.Vehicles {
			if len(v.Trips) > 0 {
				s.VehiclesUsed++
			}
			for _, t := range v.Trips {
				s.Trips++
				s.OrdersServed += len(t.Stops)
				s.TotalWeightKg += t.WeightKg
				s.TotalVolumeM3 += t.VolumeM3
				s.TotalDistanceKm += t.DistanceKm
				s.FuelLitres += t.FuelLitres
				capKg += v.WeightCapacityKg
				capM3 += v.VolumeCapacityM3
			}
		}
		s.FleetUtilization = ratio(float64(s.VehiclesUsed), float64(s.VehiclesAvailable))
		s.WeightUtilization = ratio(s.TotalWeightKg, capKg)
		s.VolumeUtilization = ratio(s.TotalVolumeM3, capM3)
		out.Depots = append(out.Depots, roundSummary(s))
		addSummary(&out.Totals, s)
		totCapKg += capKg
		totCapM3 += capM3
	}
	t := &out.Totals
	t.FleetUtilization = ratio(float64(t.VehiclesUsed), float64(t.VehiclesAvailable))
	t.WeightUtilization = ratio(t.TotalWeightKg, totCapKg)
	t.VolumeUtilization = ratio(t.TotalVolumeM3, totCapM3)
	out.Totals = roundSummary(*t)
	writeJSON(w, http.StatusOK, out)
}

// GET /depots/{depot}/schedule?date=YYYY-MM-DD
func (a *API) getDepotSchedule(w http.ResponseWriter, r *http.Request) {
	depot, ok := canonicalDepot(r.PathValue("depot"))
	if !ok {
		writeError(w, http.StatusNotFound, "unknown depot: "+r.PathValue("depot"))
		return
	}
	date, err := a.dateParam(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	sched, err := a.store.DepotSchedule(r.Context(), date, depot)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load schedule")
		return
	}
	writeJSON(w, http.StatusOK, sched)
}

// GET /schedule/deferrals?date=YYYY-MM-DD&depot=Peliyagoda
func (a *API) getDeferrals(w http.ResponseWriter, r *http.Request) {
	date, err := a.dateParam(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	depot := ""
	if q := r.URL.Query().Get("depot"); q != "" {
		var ok bool
		if depot, ok = canonicalDepot(q); !ok {
			writeError(w, http.StatusBadRequest, "unknown depot: "+q)
			return
		}
	}
	orders, err := a.store.DeferredOrders(r.Context(), date, depot)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load deferrals")
		return
	}
	writeJSON(w, http.StatusOK, DeferralList{Date: date.Format(dateLayout), Depot: depot, Count: len(orders), Orders: orders})
}

// POST /planning-runs — called by the nightly cron job; plans tomorrow unless planDate is given.
func (a *API) startPlanning(w http.ResponseWriter, r *http.Request) {
	var req StartPlanningRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	today := a.today()
	planDate := today.AddDate(0, 0, 1)
	if req.PlanDate != "" {
		d, err := time.ParseInLocation(dateLayout, req.PlanDate, sriLanka)
		if err != nil {
			writeError(w, http.StatusBadRequest, "planDate must be YYYY-MM-DD")
			return
		}
		if d.Before(today) {
			writeError(w, http.StatusBadRequest, "planDate is in the past")
			return
		}
		planDate = d
	}
	trigger := req.Trigger
	if trigger == "" {
		trigger = "cron"
	}
	run, started := a.runs.Start(planDate, trigger)
	if !started {
		writeJSON(w, http.StatusConflict, run)
		return
	}
	writeJSON(w, http.StatusAccepted, run)
}

func (a *API) today() time.Time {
	y, m, d := a.now().In(sriLanka).Date()
	return time.Date(y, m, d, 0, 0, 0, 0, sriLanka)
}

func (a *API) dateParam(r *http.Request) (time.Time, error) {
	q := r.URL.Query().Get("date")
	if q == "" {
		return a.today(), nil
	}
	d, err := time.ParseInLocation(dateLayout, q, sriLanka)
	if err != nil {
		return time.Time{}, errors.New("date must be YYYY-MM-DD")
	}
	return d, nil
}

func canonicalDepot(s string) (string, bool) {
	for _, d := range depots {
		if strings.EqualFold(d, s) {
			return d, true
		}
	}
	return "", false
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, ErrorResponse{Error: msg})
}

func addSummary(t *DepotSummary, s DepotSummary) {
	t.VehiclesAvailable += s.VehiclesAvailable
	t.VehiclesUsed += s.VehiclesUsed
	t.Trips += s.Trips
	t.TotalWeightKg += s.TotalWeightKg
	t.TotalVolumeM3 += s.TotalVolumeM3
	t.OrdersServed += s.OrdersServed
	t.OrdersDeferred += s.OrdersDeferred
	t.TotalDistanceKm += s.TotalDistanceKm
	t.FuelLitres += s.FuelLitres
}

func roundSummary(s DepotSummary) DepotSummary {
	s.FleetUtilization = round(s.FleetUtilization, 4)
	s.WeightUtilization = round(s.WeightUtilization, 4)
	s.VolumeUtilization = round(s.VolumeUtilization, 4)
	s.TotalWeightKg = round(s.TotalWeightKg, 1)
	s.TotalVolumeM3 = round(s.TotalVolumeM3, 3)
	s.TotalDistanceKm = round(s.TotalDistanceKm, 1)
	s.FuelLitres = round(s.FuelLitres, 1)
	return s
}

func ratio(a, b float64) float64 {
	if b == 0 {
		return 0
	}
	return a / b
}

func round(x float64, places int) float64 {
	p := math.Pow(10, float64(places))
	return math.Round(x*p) / p
}

func tripID(vehicleID string, n int) string {
	return vehicleID + "-T" + strconv.Itoa(n)
}
