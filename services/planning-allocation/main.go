// Planning & Allocation service: route planning and resource allocation engine.
// API contract: openapi.yaml (shown in the dev Swagger UI).
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"
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

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "3003"
	}

	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"service":   serviceName,
			"status":    "healthy",
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
	})

	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"service": serviceName,
			"message": "Route Planning & Resource Allocation Engine Service Operational",
		})
	})

	api := &API{store: stubStore{}, runs: NewRunManager(stubPlanner{}, 30*time.Minute), now: time.Now}
	api.routes(mux)

	log.Printf("[%s] Microservice listening on port %s", serviceName, port)
	log.Fatal(http.ListenAndServe(":"+port, cors(mux)))
}
