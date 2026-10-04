package main

// Inbound authentication, the Go twin of Order Management's authGuard: auth-rbac signs HS256 access
// tokens with JWT_ACCESS_SECRET and every service verifies them locally, without calling auth-rbac.
// Services (Execution & Sync, this one) sign their own role "system" tokens with the same secret.

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strings"
	"time"
)

// Claims of an auth-rbac access token (see services/auth-rbac/src/types/auth.types.ts).
type Claims struct {
	Sub      string  `json:"sub"`
	Username string  `json:"username"`
	Role     string  `json:"role"`
	OutletID *string `json:"outlet_id"`
	Depot    *string `json:"depot"`
	// VehicleID is the vehicle a driver account drives (auth-rbac users.vehicle_id).
	VehicleID *string `json:"vehicle_id,omitempty"`
	Type      string  `json:"type"`
	Exp       int64   `json:"exp"`
	Nbf       int64   `json:"nbf,omitempty"`
}

var knownRoles = []string{"dispatcher", "loader", "driver", "store_manager", "system"}

// clockSkew tolerates small clock differences between the issuing and verifying hosts.
const clockSkew = 30 * time.Second

var (
	errInvalidToken = errors.New("invalid access token")
	errExpiredToken = errors.New("access token has expired")
)

func hs256(secret, unsigned string) []byte {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(unsigned))
	return mac.Sum(nil)
}

// verifyAccessToken checks an access token the way jsonwebtoken does for the Node services: HS256
// only (never "none" or another algorithm named by the token), a valid signature, not expired, and
// an access (not refresh) token for a known role.
func verifyAccessToken(secret, token string, now time.Time) (*Claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, errInvalidToken
	}
	enc := base64.RawURLEncoding
	var header struct {
		Alg string `json:"alg"`
	}
	if raw, err := enc.DecodeString(parts[0]); err != nil || json.Unmarshal(raw, &header) != nil || header.Alg != "HS256" {
		return nil, errInvalidToken
	}
	sig, err := enc.DecodeString(parts[2])
	if err != nil || !hmac.Equal(sig, hs256(secret, parts[0]+"."+parts[1])) {
		return nil, errInvalidToken
	}
	var c Claims
	if raw, err := enc.DecodeString(parts[1]); err != nil || json.Unmarshal(raw, &c) != nil {
		return nil, errInvalidToken
	}
	if c.Exp == 0 || now.After(time.Unix(c.Exp, 0).Add(clockSkew)) {
		return nil, errExpiredToken
	}
	if c.Nbf != 0 && now.Add(clockSkew).Before(time.Unix(c.Nbf, 0)) {
		return nil, errInvalidToken
	}
	if c.Type != "access" || c.Sub == "" || !slices.Contains(knownRoles, c.Role) {
		return nil, errInvalidToken
	}
	return &c, nil
}

type claimsKey struct{}

// claimsFrom returns the caller of a request that passed API.auth.
func claimsFrom(r *http.Request) *Claims {
	c, _ := r.Context().Value(claimsKey{}).(*Claims)
	return c
}

// auth admits requests with a valid access token for one of roles: 401 without one, 403 for
// another role.
func (a *API) auth(roles []string, h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || strings.TrimSpace(token) == "" {
			writeError(w, http.StatusUnauthorized, "bearer access token required")
			return
		}
		c, err := verifyAccessToken(a.secret, strings.TrimSpace(token), time.Now())
		if err != nil {
			writeError(w, http.StatusUnauthorized, err.Error())
			return
		}
		if !slices.Contains(roles, c.Role) {
			writeError(w, http.StatusForbidden, fmt.Sprintf("role %q may not do this; requires one of: %s", c.Role, strings.Join(roles, ", ")))
			return
		}
		h(w, r.WithContext(context.WithValue(r.Context(), claimsKey{}, c)))
	}
}

// driverVehicle limits a driver to the vehicle in their token. It returns the vehicle to filter by
// ("" for anyone else), or false after writing 403 for a driver account without a vehicle.
func driverVehicle(w http.ResponseWriter, r *http.Request) (string, bool) {
	c := claimsFrom(r)
	if c == nil || c.Role != "driver" {
		return "", true
	}
	if c.VehicleID == nil || *c.VehicleID == "" {
		writeError(w, http.StatusForbidden, "driver account is not linked to a vehicle")
		return "", false
	}
	return *c.VehicleID, true
}

// loaderDepot limits a loader to the depot in their token; everyone else may see every depot.
// requested is the depot asked for ("" = all). It returns the depot to use, or false after
// writing 403.
func loaderDepot(w http.ResponseWriter, r *http.Request, requested string) (string, bool) {
	c := claimsFrom(r)
	if c == nil || c.Role != "loader" {
		return requested, true
	}
	if c.Depot == nil || *c.Depot == "" {
		writeError(w, http.StatusForbidden, "loader account is not linked to a depot")
		return "", false
	}
	own, ok := canonicalDepot(*c.Depot)
	if !ok || (requested != "" && requested != own) {
		writeError(w, http.StatusForbidden, fmt.Sprintf("a loader for %s may not see %s", *c.Depot, requested))
		return "", false
	}
	return own, true
}
