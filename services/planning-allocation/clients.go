package main

// Clients for the services Planning reads from and writes to. Planning goes through their APIs only;
// it never reads another service's tables.

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// systemActorID is the actor recorded in Order Management's audit trail for planning write-backs.
const systemActorID = "00000000-0000-0000-0000-000000000000"

// serviceToken mints a short-lived access token with role "system", signed with the shared
// JWT_ACCESS_SECRET the other services verify against (and verifyAccessToken in auth.go accepts).
func serviceToken(secret string, now time.Time) string {
	enc := base64.RawURLEncoding
	header := enc.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	claims, _ := json.Marshal(map[string]any{
		"sub": systemActorID, "username": serviceName, "role": "system",
		"outlet_id": nil, "depot": nil, "type": "access",
		"iat": now.Unix(), "exp": now.Add(10 * time.Minute).Unix(),
	})
	unsigned := header + "." + enc.EncodeToString(claims)
	return unsigned + "." + enc.EncodeToString(hs256(secret, unsigned))
}

// apiError is a non-2xx reply from another service.
type apiError struct {
	Service string
	Status  int
	Message string
}

func (e *apiError) Error() string {
	return fmt.Sprintf("%s returned %d: %s", e.Service, e.Status, e.Message)
}

type serviceClient struct {
	name    string
	baseURL string
	secret  string // empty = no Authorization header
	http    *http.Client
}

// call sends a request and decodes the { success, data } envelope's data into out.
func (c *serviceClient) call(ctx context.Context, method, path string, body, out any) error {
	var rd io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(c.baseURL, "/")+path, rd)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.secret != "" {
		req.Header.Set("Authorization", "Bearer "+serviceToken(c.secret, time.Now()))
	}
	res, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("%s unreachable: %w", c.name, err)
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		return fmt.Errorf("%s: read response: %w", c.name, err)
	}
	var env struct {
		Data  json.RawMessage `json:"data"`
		Error json.RawMessage `json:"error"`
	}
	_ = json.Unmarshal(raw, &env)
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return &apiError{Service: c.name, Status: res.StatusCode, Message: errorText(env.Error, raw)}
	}
	if out == nil {
		return nil
	}
	if len(env.Data) == 0 {
		return fmt.Errorf("%s: response has no data", c.name)
	}
	if err := json.Unmarshal(env.Data, out); err != nil {
		return fmt.Errorf("%s: decode response: %w", c.name, err)
	}
	return nil
}

// Ready reports whether the service answers GET /health with 2xx.
func (c *serviceClient) Ready(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(c.baseURL, "/")+"/health", nil)
	if err != nil {
		return err
	}
	res, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("%s unreachable: %w", c.name, err)
	}
	res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return fmt.Errorf("%s /health returned %d", c.name, res.StatusCode)
	}
	return nil
}

// errorText flattens the error shapes the Node services use ("text" or {code, message, details}).
func errorText(e json.RawMessage, raw []byte) string {
	var s string
	if json.Unmarshal(e, &s) == nil && s != "" {
		return s
	}
	var obj struct {
		Code    string          `json:"code"`
		Message string          `json:"message"`
		Details json.RawMessage `json:"details"`
	}
	if json.Unmarshal(e, &obj) == nil && obj.Message != "" {
		msg := obj.Message
		if obj.Code != "" {
			msg = obj.Code + ": " + msg
		}
		if len(obj.Details) > 0 && string(obj.Details) != "null" {
			msg += " " + string(obj.Details)
		}
		return msg
	}
	if len(raw) > 300 {
		raw = raw[:300]
	}
	return strings.TrimSpace(string(raw))
}

// ---------------------------------------------------------------- Order Management

type ConfirmedOrder struct {
	OrderRef          string  `json:"order_ref"`
	OutletID          string  `json:"outlet_id"`
	Brand             string  `json:"brand"`
	Depot             string  `json:"depot"`
	District          string  `json:"district"`
	TempRequirement   string  `json:"temp_requirement"`
	OrderWeightKg     float64 `json:"order_weight_kg"`
	OrderVolumeM3     float64 `json:"order_volume_m3"`
	WindowOpenTime    string  `json:"window_open_time"`
	WindowCloseTime   string  `json:"window_close_time"`
	DockType          string  `json:"dock_type"`
	ParkingConstraint string  `json:"parking_constraint"`
	DeferralCount     int     `json:"deferral_count"`
	DeferredYesterday bool    `json:"deferred_yesterday"`
	DaysSinceServed   int     `json:"days_since_last_served"`
	OriginalOrderDate string  `json:"original_order_date"`
}

type OrderItem struct {
	SKU         string `json:"sku"`
	Description string `json:"description"`
	Quantity    int    `json:"quantity"`
}

type StatusUpdate struct {
	OrderRef   string `json:"order_ref"`
	Status     string `json:"status"`
	VehicleID  string `json:"vehicle_id,omitempty"`
	TripID     int    `json:"trip_id,omitempty"`
	ReasonCode string `json:"reason_code,omitempty"`
	ReasonNote string `json:"reason_note,omitempty"`
}

// PlannedDelivery is one order's planned times, sent when a past day is marked delivered (demo history).
type PlannedDelivery struct {
	OrderRef      string `json:"order_ref"`
	DepartureTime string `json:"departure_time"`
	ArrivalTime   string `json:"arrival_time"`
}

type OrdersAPI interface {
	// CloseWindow runs the (idempotent) cutoff sweep for date ("" = the next run date) and returns
	// the date it closed.
	CloseWindow(ctx context.Context, date string) (string, error)
	Confirmed(ctx context.Context, date string) ([]ConfirmedOrder, error)
	Items(ctx context.Context, orderRef string) ([]OrderItem, error)
	StatusBatch(ctx context.Context, updates []StatusUpdate) error
	// SimulateDelivery marks a past day's allocated orders delivered and received (demo history only;
	// Order Management answers 403 when demo data is off) and returns how many it changed.
	SimulateDelivery(ctx context.Context, date string, deliveries []PlannedDelivery) (int, error)
}

type orderClient struct{ serviceClient }

func newOrderClient(baseURL, secret string) *orderClient {
	return &orderClient{serviceClient{name: "order-management", baseURL: baseURL, secret: secret,
		http: &http.Client{Timeout: 30 * time.Second}}}
}

func (c *orderClient) CloseWindow(ctx context.Context, date string) (string, error) {
	body := map[string]string{}
	if date != "" {
		body["date"] = date
	}
	var out struct {
		JobKey string `json:"job_key"`
	}
	if err := c.call(ctx, http.MethodPost, "/api/orders/close-window", body, &out); err != nil {
		return "", err
	}
	return out.JobKey, nil
}

func (c *orderClient) Confirmed(ctx context.Context, date string) ([]ConfirmedOrder, error) {
	var out struct {
		Orders []ConfirmedOrder `json:"orders"`
	}
	err := c.call(ctx, http.MethodGet, "/api/orders/confirmed?date="+url.QueryEscape(date), nil, &out)
	return out.Orders, err
}

func (c *orderClient) Items(ctx context.Context, orderRef string) ([]OrderItem, error) {
	var out struct {
		Items []OrderItem `json:"items"`
	}
	err := c.call(ctx, http.MethodGet, "/api/orders/"+url.PathEscape(orderRef), nil, &out)
	return out.Items, err
}

func (c *orderClient) StatusBatch(ctx context.Context, updates []StatusUpdate) error {
	return c.call(ctx, http.MethodPatch, "/api/orders/status-batch", map[string]any{"updates": updates}, nil)
}

func (c *orderClient) SimulateDelivery(ctx context.Context, date string, deliveries []PlannedDelivery) (int, error) {
	var out struct {
		Received int `json:"received"`
	}
	err := c.call(ctx, http.MethodPost, "/api/orders/simulate-delivery", map[string]any{"date": date, "deliveries": deliveries}, &out)
	return out.Received, err
}

// ---------------------------------------------------------------- Fleet & Directory

type FleetVehicle struct {
	VehicleID     string  `json:"vehicle_id"`
	Type          string  `json:"type"`
	Temp          string  `json:"temp"`
	WeightCapKg   float64 `json:"weight_cap_kg"`
	VolumeCapM3   float64 `json:"volume_cap_m3"`
	KmPerL        float64 `json:"km_per_l"`
	Depot         string  `json:"depot"`
	WeeklyRangeKm float64 `json:"weekly_range_km"`
	Status        string  `json:"status"`
}

type FleetFuelUsage struct {
	VehicleID string  `json:"vehicle_id"`
	KmLeft    float64 `json:"km_left"`
}

type TravelMetrics struct {
	DistrictTravel []struct {
		District                   string  `json:"district"`
		Depot                      string  `json:"depot"`
		DepotToDistrictKm          float64 `json:"depot_to_district_km"`
		DepotToDistrictFreeflowMin float64 `json:"depot_to_district_freeflow_min"`
		InterStopKm                float64 `json:"inter_stop_km"`
		InterStopFreeflowMin       float64 `json:"inter_stop_freeflow_min"`
	} `json:"district_travel"`
	ServiceAllowances []struct {
		Brand      string  `json:"brand"`
		DockType   string  `json:"dock_type"`
		AllowanceM float64 `json:"service_allowance_min"`
	} `json:"service_allowances"`
}

type FleetAPI interface {
	// AvailableVehicles lists vehicles not in the workshop and without downtime on date.
	AvailableVehicles(ctx context.Context, date string) ([]FleetVehicle, error)
	FuelUsage(ctx context.Context, isoYear, isoWeek int) ([]FleetFuelUsage, error)
	TravelMetrics(ctx context.Context) (TravelMetrics, error)
}

type fleetClient struct{ serviceClient }

func newFleetClient(baseURL, secret string) *fleetClient {
	return &fleetClient{serviceClient{name: "fleet-directory", baseURL: baseURL, secret: secret,
		http: &http.Client{Timeout: 30 * time.Second}}}
}

func (c *fleetClient) AvailableVehicles(ctx context.Context, date string) ([]FleetVehicle, error) {
	var out []FleetVehicle
	err := c.call(ctx, http.MethodGet, "/api/fleet/vehicles?available_on="+url.QueryEscape(date), nil, &out)
	return out, err
}

func (c *fleetClient) FuelUsage(ctx context.Context, isoYear, isoWeek int) ([]FleetFuelUsage, error) {
	var out []FleetFuelUsage
	err := c.call(ctx, http.MethodGet, fmt.Sprintf("/api/fleet/vehicles/fuel-usage?iso_year=%d&iso_week=%d", isoYear, isoWeek), nil, &out)
	return out, err
}

func (c *fleetClient) TravelMetrics(ctx context.Context) (TravelMetrics, error) {
	var out TravelMetrics
	err := c.call(ctx, http.MethodGet, "/api/fleet/travel-metrics", nil, &out)
	return out, err
}
