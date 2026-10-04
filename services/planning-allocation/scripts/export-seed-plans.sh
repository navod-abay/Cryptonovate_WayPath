#!/bin/sh
# Writes the completed catch-up plans in the running stack's database to seed-data/plans.csv, which
# catch-up runs replay instead of solving (seedplans.go). Run it after a stack started on an empty
# volume has finished catch-up (to re-solve rather than replay, start that stack with
# PLANNING_SEEDED_PLANS=off), then rebuild the planning image.
#
# Usage: services/planning-allocation/scripts/export-seed-plans.sh
#   PG_CONTAINER (default delivery_postgres), POSTGRES_USER (postgres), POSTGRES_DB (delivery_db)
set -eu
out="$(dirname "$0")/../seed-data/plans.csv"

docker exec -i "${PG_CONTAINER:-delivery_postgres}" \
  psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-delivery_db}" -q <<'SQL' > "$out"
COPY (
  WITH runs AS (
    SELECT run_id, dense_rank() OVER (ORDER BY plan_date) AS day
      FROM planning_runs WHERE status = 'COMPLETED' AND trigger = 'catchup'
  )
  SELECT r.day, t.vehicle_id, t.trip_number, s.sequence, s.outlet_id, s.temperature, s.weight_kg, s.volume_m3
    FROM runs r JOIN planned_trips t ON t.run_id = r.run_id JOIN planned_stops s ON s.trip_id = t.trip_id
  UNION ALL
  SELECT r.day, '', NULL, NULL, d.outlet_id, d.temperature, d.weight_kg, d.volume_m3
    FROM runs r JOIN planned_deferrals d ON d.run_id = r.run_id
  ORDER BY 1, 2, 3, 4, 5
) TO STDOUT WITH (FORMAT csv, HEADER)
SQL

echo "wrote $(($(wc -l < "$out") - 1)) planned orders to $out"
