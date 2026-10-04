package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// signToken builds a token the way auth-rbac does, with any header and claims, so tests can forge
// the bad ones too.
func signToken(t *testing.T, secret string, header, claims map[string]any) string {
	t.Helper()
	enc := base64.RawURLEncoding
	h, _ := json.Marshal(header)
	c, _ := json.Marshal(claims)
	unsigned := enc.EncodeToString(h) + "." + enc.EncodeToString(c)
	return unsigned + "." + enc.EncodeToString(hs256(secret, unsigned))
}

var hs256Header = map[string]any{"alg": "HS256", "typ": "JWT"}

// testUserID is the sub of userToken's tokens; samplePlan assigns some vehicles to it as a loader.
const testUserID = "9595b3cf-eec1-4559-9fcc-889ef5a9280c"

func userClaims(role string, depot any) map[string]any {
	return map[string]any{
		"sub": testUserID, "username": role + "_user", "role": role,
		"outlet_id": nil, "depot": depot, "vehicle_id": testDriverVehicle(role), "type": "access",
		"iat": time.Now().Unix(), "exp": time.Now().Add(15 * time.Minute).Unix(),
	}
}

// testDriverVehicle is the vehicle in a driver's test token: VEH003, which samplePlan plans.
func testDriverVehicle(role string) any {
	if role == "driver" {
		return "VEH003"
	}
	return nil
}

func userToken(t *testing.T, role string, depot any) string {
	return signToken(t, testSecret, hs256Header, userClaims(role, depot))
}

func call(h http.Handler, method, path, token string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestVerifyAccessTokenRejectsForgedAndUnusableTokens(t *testing.T) {
	now := time.Now()
	with := func(change func(map[string]any)) map[string]any {
		c := userClaims("dispatcher", "Peliyagoda")
		change(c)
		return c
	}
	good := signToken(t, testSecret, hs256Header, userClaims("dispatcher", "Peliyagoda"))
	if c, err := verifyAccessToken(testSecret, good, now); err != nil || c.Role != "dispatcher" || *c.Depot != "Peliyagoda" {
		t.Fatalf("valid token: claims %+v, err %v", c, err)
	}
	if _, err := verifyAccessToken(testSecret, serviceToken(testSecret, now), now); err != nil {
		t.Fatalf("our own service token must verify: %v", err)
	}

	parts := strings.Split(good, ".")
	enc := base64.RawURLEncoding
	noneHeader, _ := json.Marshal(map[string]any{"alg": "none", "typ": "JWT"})
	cases := map[string]string{
		"wrong secret":     signToken(t, "another-secret", hs256Header, userClaims("dispatcher", nil)),
		"tampered payload": parts[0] + "." + enc.EncodeToString([]byte(`{"sub":"x","role":"system","type":"access","exp":9999999999}`)) + "." + parts[2],
		"alg none":         enc.EncodeToString(noneHeader) + "." + parts[1] + ".",
		"alg HS512":        signToken(t, testSecret, map[string]any{"alg": "HS512", "typ": "JWT"}, userClaims("dispatcher", nil)),
		"expired":          signToken(t, testSecret, hs256Header, with(func(c map[string]any) { c["exp"] = now.Add(-time.Minute).Unix() })),
		"no exp":           signToken(t, testSecret, hs256Header, with(func(c map[string]any) { delete(c, "exp") })),
		"refresh token":    signToken(t, testSecret, hs256Header, with(func(c map[string]any) { c["type"] = "refresh" })),
		"unknown role":     signToken(t, testSecret, hs256Header, with(func(c map[string]any) { c["role"] = "admin" })),
		"no subject":       signToken(t, testSecret, hs256Header, with(func(c map[string]any) { delete(c, "sub") })),
		"not yet valid":    signToken(t, testSecret, hs256Header, with(func(c map[string]any) { c["nbf"] = now.Add(time.Hour).Unix() })),
		"two parts":        parts[0] + "." + parts[1],
		"garbage":          "not-a-token",
	}
	for name, token := range cases {
		if _, err := verifyAccessToken(testSecret, token, now); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
	// A token that expired a few seconds ago is still within the clock-skew allowance.
	recent := signToken(t, testSecret, hs256Header, with(func(c map[string]any) { c["exp"] = now.Add(-10 * time.Second).Unix() }))
	if _, err := verifyAccessToken(testSecret, recent, now); err != nil {
		t.Errorf("10s past exp should be tolerated: %v", err)
	}
}

// /health and / are registered in main.go, outside API.routes, so they stay public.
func TestEveryAPIRouteNeedsAValidBearerToken(t *testing.T) {
	store := newMemStore()
	store.seed("2026-10-05", samplePlan("2026-10-05"))
	h := newTestServer(store, noopPlanner)
	for _, path := range []string{"/schedule/summary?date=2026-10-05", "/api/planning/trips/20261005-VEH003-T1", "/planning-runs?date=2026-10-05"} {
		if rec := call(h, "GET", path, ""); rec.Code != http.StatusUnauthorized {
			t.Errorf("%s without a token: status %d, want 401", path, rec.Code)
		}
	}
	req := httptest.NewRequest("GET", "/trips/20261005-VEH003-T1", nil)
	req.Header.Set("Authorization", "Basic abc")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("non-bearer scheme: status %d, want 401", rec.Code)
	}
	if rec := call(h, "GET", "/trips/20261005-VEH003-T1", signToken(t, "another-secret", hs256Header, userClaims("dispatcher", nil))); rec.Code != http.StatusUnauthorized {
		t.Errorf("forged token: status %d, want 401", rec.Code)
	}
}

func TestRolesPerRoute(t *testing.T) {
	store := newMemStore()
	store.seed("2026-10-05", samplePlan("2026-10-05"))
	h := newTestServer(store, noopPlanner)
	type route struct{ method, path string }
	summary := route{"GET", "/schedule/summary?date=2026-10-05"}
	schedule := route{"GET", "/depots/Peliyagoda/schedule?date=2026-10-05"}
	deferrals := route{"GET", "/schedule/deferrals?date=2026-10-05"}
	trips := route{"GET", "/trips?date=2026-10-05"}
	trip := route{"GET", "/trips/20261005-VEH003-T1"}
	runs := route{"GET", "/planning-runs?date=2026-10-05"}
	start := route{"POST", "/planning-runs"}

	allowed := map[string][]route{
		"dispatcher":    {summary, schedule, deferrals, trips, trip, runs},
		"loader":        {trips, trip},
		"driver":        {trips, trip},
		"store_manager": {},
	}
	all := []route{summary, schedule, deferrals, trips, trip, runs, start}
	for role, ok := range allowed {
		token := userToken(t, role, "Peliyagoda")
		for _, r := range all {
			want := http.StatusForbidden
			for _, a := range ok {
				if a == r {
					want = 0 // anything but 401/403
				}
			}
			rec := call(h, r.method, r.path, token)
			if want == http.StatusForbidden && rec.Code != http.StatusForbidden {
				t.Errorf("%s %s %s: status %d, want 403", role, r.method, r.path, rec.Code)
			}
			if want == 0 && (rec.Code == http.StatusUnauthorized || rec.Code == http.StatusForbidden) {
				t.Errorf("%s %s %s: status %d, want access", role, r.method, r.path, rec.Code)
			}
		}
	}
	// Starting the calculation by hand needs a service token: not even a dispatcher may.
	fresh := newTestServer(newMemStore(), noopPlanner)
	if rec := call(fresh, "POST", "/planning-runs", serviceToken(testSecret, time.Now())); rec.Code != http.StatusAccepted {
		t.Errorf("service token start: status %d, want 202", rec.Code)
	}
}

func TestLoadersOnlySeeTheirOwnDepot(t *testing.T) {
	store := newMemStore()
	store.seed("2026-10-05", samplePlan("2026-10-05"))
	h := newTestServer(store, noopPlanner)
	kandy := userToken(t, "loader", "Kandy")

	rec := call(h, "GET", "/trips?date=2026-10-05", kandy)
	var list []map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &list)
	if rec.Code != http.StatusOK || len(list) != 1 || list[0]["depot"] != "Kandy" {
		t.Errorf("Kandy loader, all depots: status %d, trips %v; want only Kandy's", rec.Code, list)
	}
	if rec := call(h, "GET", "/trips?date=2026-10-05&depot=Peliyagoda", kandy); rec.Code != http.StatusForbidden {
		t.Errorf("Kandy loader asking for Peliyagoda: status %d, want 403", rec.Code)
	}
	if rec := call(h, "GET", "/trips/20261005-VEH003-T1", kandy); rec.Code != http.StatusForbidden {
		t.Errorf("Kandy loader opening a Peliyagoda trip: status %d, want 403", rec.Code)
	}
	if rec := call(h, "GET", "/trips/20261005-VEH003-T1", userToken(t, "loader", "Peliyagoda")); rec.Code != http.StatusOK {
		t.Errorf("Peliyagoda loader opening its own trip: status %d, want 200", rec.Code)
	}
	if rec := call(h, "GET", "/trips?date=2026-10-05", userToken(t, "loader", nil)); rec.Code != http.StatusForbidden {
		t.Errorf("loader without a depot: status %d, want 403", rec.Code)
	}
}

func TestDriversOnlySeeTheirOwnVehicle(t *testing.T) {
	store := newMemStore()
	store.seed("2026-10-05", samplePlan("2026-10-05"))
	h := newTestServer(store, noopPlanner)
	driver := userToken(t, "driver", "Peliyagoda") // drives VEH003

	for _, path := range []string{"/trips?date=2026-10-05", "/trips?date=2026-10-05&vehicleId=VEH018"} {
		rec := call(h, "GET", path, driver)
		var list []map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &list)
		if rec.Code != http.StatusOK || len(list) != 1 || list[0]["vehicleId"] != "VEH003" {
			t.Errorf("driver GET %s: status %d, trips %v; want only VEH003's", path, rec.Code, list)
		}
	}
	if rec := call(h, "GET", "/trips/20261005-VEH003-T1", driver); rec.Code != http.StatusOK {
		t.Errorf("driver opening their own trip: status %d, want 200", rec.Code)
	}
	if rec := call(h, "GET", "/trips/20261005-VEH018-T1", driver); rec.Code != http.StatusForbidden {
		t.Errorf("driver opening another vehicle's trip: status %d, want 403", rec.Code)
	}
	claims := userClaims("driver", "Peliyagoda")
	claims["vehicle_id"] = nil
	if rec := call(h, "GET", "/trips?date=2026-10-05", signToken(t, testSecret, hs256Header, claims)); rec.Code != http.StatusForbidden {
		t.Errorf("driver without a vehicle: status %d, want 403", rec.Code)
	}
}

func TestLoadersOnlySeeTheirAssignedVehicles(t *testing.T) {
	store := newMemStore()
	store.seed("2026-10-05", samplePlan("2026-10-05"))
	h := newTestServer(store, noopPlanner)
	loader := userToken(t, "loader", "Peliyagoda")

	tripIDs := func(rec *httptest.ResponseRecorder) []any {
		var list []map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &list)
		var ids []any
		for _, trip := range list {
			ids = append(ids, trip["tripId"])
		}
		return ids
	}
	// VEH003 is assigned to this loader, VEH018 to another Peliyagoda loader.
	for _, path := range []string{"/trips?date=2026-10-05", "/trips?date=2026-10-05&loaderId=loader-2"} {
		rec := call(h, "GET", path, loader)
		if ids := tripIDs(rec); rec.Code != http.StatusOK || fmt.Sprint(ids) != "[20261005-VEH003-T1]" {
			t.Errorf("loader GET %s: status %d, trips %v; want only their own VEH003", path, rec.Code, ids)
		}
	}
	if rec := call(h, "GET", "/trips/20261005-VEH018-T1", loader); rec.Code != http.StatusForbidden {
		t.Errorf("loader opening another loader's trip: status %d, want 403", rec.Code)
	}
	rec := call(h, "GET", "/trips?date=2026-10-05&loaderId=loader-2", userToken(t, "dispatcher", nil))
	if ids := tripIDs(rec); rec.Code != http.StatusOK || fmt.Sprint(ids) != "[20261005-VEH018-T1]" {
		t.Errorf("dispatcher filtering by loader: status %d, trips %v; want VEH018", rec.Code, ids)
	}
}
