// Planning & Allocation service: route planning and resource allocation engine.
// API contract: openapi.yaml (shown in the dev Swagger UI).
package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const serviceName = "planning-allocation"

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		log.Printf("encode response: %v", err)
	}
}

// cors mirrors the permissive cors() used by the Node services.
func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envInt(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 1 {
		log.Fatalf("[%s] %s must be a positive integer, got %q", serviceName, key, v)
	}
	return n
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("[%s] %s is required", serviceName, key)
	}
	return v
}

func connect(ctx context.Context, url string) *pgxpool.Pool {
	db, err := pgxpool.New(ctx, url)
	if err != nil {
		log.Fatalf("[%s] DATABASE_URL: %v", serviceName, err)
	}
	for attempt := 1; ; attempt++ {
		err = db.Ping(ctx)
		if err == nil {
			return db
		}
		if attempt == 10 {
			log.Fatalf("[%s] cannot reach PostgreSQL: %v", serviceName, err)
		}
		time.Sleep(2 * time.Second)
	}
}

func main() {
	ctx := context.Background()
	port := env("PORT", "5003")
	secret := mustEnv("JWT_ACCESS_SECRET")

	db := connect(ctx, mustEnv("DATABASE_URL"))
	store := &pgStore{db: db}
	if err := store.AssertSchema(ctx); err != nil {
		log.Fatalf("[%s] FATAL: %v", serviceName, err)
	}
	if n, err := store.FailInterruptedRuns(ctx); err != nil {
		log.Fatalf("[%s] recover interrupted runs: %v", serviceName, err)
	} else if n > 0 {
		log.Printf("[%s] marked %d run(s) interrupted by the last restart as failed", serviceName, n)
	}

	orders := newOrderClient(env("ORDER_SERVICE_URL", "http://order-management:5002"), secret)
	fleet := newFleetClient(env("FLEET_SERVICE_URL", "http://fleet-directory:5004"))
	params := DefaultALNSParams()
	params.Iterations = envInt("PLANNING_ITERATIONS", 2000)
	planner := &ALNSPlanner{orders: orders, fleet: fleet, store: store, params: params, seeds: envInt("PLANNING_SEEDS", 5),
		catchupSeeds: envInt("PLANNING_CATCHUP_SEEDS", 1)}
	runs := NewRunManager(store, store, planner, 30*time.Minute)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		pingCtx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		status, code, dbState := "healthy", http.StatusOK, "up"
		if err := db.Ping(pingCtx); err != nil {
			status, code, dbState = "degraded", http.StatusServiceUnavailable, "down"
		}
		writeJSON(w, code, map[string]any{
			"service":   serviceName,
			"status":    status,
			"db":        dbState,
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
	})
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"service": serviceName,
			"message": "Route Planning & Resource Allocation Engine Service Operational",
		})
	})

	api := &API{store: store, runs: runs, now: time.Now,
		nextRunDate: func(ctx context.Context) (time.Time, error) {
			day, err := orders.CloseWindow(ctx, "")
			if err != nil {
				return time.Time{}, err
			}
			return time.ParseInLocation(dateLayout, day, sriLanka)
		}}
	api.routes(mux)

	if env("PLANNING_SCHEDULER", "on") != "off" {
		sched := &Scheduler{orders: orders, deps: []func(context.Context) error{orders.Ready, fleet.Ready},
			runs: runs, store: store, plans: store, triggerHour: envInt("PLANNING_TRIGGER_HOUR", 16),
			catchupDays: envInt("PLANNING_CATCHUP_DAYS", 7),
			interval:    time.Duration(envInt("PLANNING_TICK_SECONDS", 60)) * time.Second,
			maxAttempts: envInt("PLANNING_MAX_ATTEMPTS", 3), now: time.Now}
		go sched.Run(ctx)
	}

	log.Printf("[%s] Microservice listening on port %s (ALNS3: %d iterations × %d seeds, %d for catch-up)",
		serviceName, port, params.Iterations, planner.seeds, planner.catchupSeeds)
	log.Fatal(http.ListenAndServe(":"+port, cors(mux)))
}
