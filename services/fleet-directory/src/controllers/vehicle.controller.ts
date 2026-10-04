import { Request, Response } from 'express';
import {
  Vehicle,
  ApiResponse,
  LogDistanceRequestSchema,
  FuelUsageQuerySchema,
  GetVehiclesQuerySchema,
  VehicleDowntimeRequestSchema,
} from '../contracts';
import { pool } from '../db/pool';

// ---------------------------------------------------------------------------
// Row interfaces
// ---------------------------------------------------------------------------

interface VehicleRow {
  vehicle_id: string;
  type: Vehicle['type'];
  temp: Vehicle['temp'];
  weight_cap_kg: number | string;
  volume_cap_m3: number | string;
  fuel_type: Vehicle['fuel_type'];
  km_per_l: number | string;
  weekly_fuel_quota_l: number | string;
  depot: Vehicle['depot'];
  weekly_range_km: number | string | null;
  status: Vehicle['status'];
}

interface VehicleEfficiencyRow {
  km_per_l: number | string;
}

interface FuelUsageRow {
  vehicle_id: string;
  weekly_fuel_quota_l: number | string;
  km_per_l: number | string;
  km_used: number | string;
  fuel_used_l: number | string;
  fuel_remaining_l: number | string;
  km_left: number | string;
}

interface DowntimeRow {
  id: string;
  vehicle_id: string;
  date_from: string;
  date_to: string;
  reason: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapVehicleRow(row: VehicleRow): Vehicle {
  return {
    vehicle_id: row.vehicle_id,
    type: row.type,
    temp: row.temp,
    weight_cap_kg: Number(row.weight_cap_kg),
    volume_cap_m3: Number(row.volume_cap_m3),
    fuel_type: row.fuel_type,
    km_per_l: Number(row.km_per_l),
    weekly_fuel_quota_l: Number(row.weekly_fuel_quota_l),
    depot: row.depot,
    weekly_range_km: row.weekly_range_km != null ? Number(row.weekly_range_km) : undefined,
    status: row.status,
  };
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export class VehicleController {
  /**
   * GET /vehicles
   * Query params:
   *   depot         (optional) – filter by depot
   *   status        (optional) – filter by vehicle status
   *   available_on  (optional, YYYY-MM-DD) – exclude vehicles with an
   *                 overlapping downtime booking AND those currently in_workshop
   */
  static async getVehicles(
    req: Request,
    res: Response<ApiResponse<Vehicle[]>>
  ): Promise<void> {
    const parsed = GetVehiclesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors.map((e) => e.message).join('; '),
        },
      });
      return;
    }

    try {
      const { depot, status, available_on } = parsed.data;
      const conditions: string[] = [];
      const values: (string | number)[] = [];

      if (depot) {
        values.push(depot.trim());
        conditions.push(`v.depot = $${values.length}`);
      }

      if (status) {
        values.push(status.trim());
        conditions.push(`v.status = $${values.length}`);
      }

      // When available_on is supplied, exclude vehicles that:
      //   (a) currently have status = 'in_workshop', OR
      //   (b) have a vehicle_downtime row whose range overlaps the requested date
      if (available_on) {
        values.push(available_on);
        const p = values.length;
        conditions.push(`v.status != 'in_workshop'`);
        conditions.push(
          `NOT EXISTS (
            SELECT 1 FROM vehicle_downtime d
            WHERE d.vehicle_id = v.vehicle_id
              AND d.date_from  <= $${p}::date
              AND d.date_to    >= $${p}::date
          )`
        );
      }

      let sql =
        'SELECT v.vehicle_id, v.type, v.temp, v.weight_cap_kg, v.volume_cap_m3, ' +
        'v.fuel_type, v.km_per_l, v.weekly_fuel_quota_l, v.depot, v.weekly_range_km, v.status ' +
        'FROM vehicles v';

      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
      sql += ' ORDER BY v.vehicle_id ASC';

      const result = await pool.query<VehicleRow>(sql, values);

      res.status(200).json({
        success: true,
        data: result.rows.map(mapVehicleRow),
      });
    } catch (error) {
      console.error('[fleet-directory] Error fetching vehicles:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to retrieve vehicles from database',
        },
      });
    }
  }

  // -------------------------------------------------------------------------

  /**
   * POST /vehicles/:vehicle_id/log-distance
   * Body: { distance_km: number, iso_year: number, week_number: number }
   */
  static async logDistance(
    req: Request<{ vehicle_id: string }>,
    res: Response<
      ApiResponse<{
        vehicle_id: string;
        distance_km: number;
        liters_consumed: number;
      }>
    >
  ): Promise<void> {
    try {
      const { vehicle_id } = req.params;
      if (!vehicle_id || typeof vehicle_id !== 'string' || vehicle_id.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'vehicle_id parameter is required' },
        });
        return;
      }

      const validationResult = LogDistanceRequestSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: validationResult.error.errors.map((e) => e.message).join('; '),
          },
        });
        return;
      }

      const { distance_km, iso_year, week_number } = validationResult.data;

      // 1. Fetch km_per_l for efficiency calculation
      const vehicleResult = await pool.query<VehicleEfficiencyRow>(
        'SELECT km_per_l FROM vehicles WHERE vehicle_id = $1',
        [vehicle_id.trim()]
      );

      if (vehicleResult.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: {
            code: 'VEHICLE_NOT_FOUND',
            message: `Vehicle with ID '${vehicle_id}' not found`,
          },
        });
        return;
      }

      const km_per_l = Number(vehicleResult.rows[0].km_per_l);
      if (!km_per_l || km_per_l <= 0) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_VEHICLE_EFFICIENCY',
            message: `Vehicle '${vehicle_id}' has invalid km_per_l efficiency rating: ${km_per_l}`,
          },
        });
        return;
      }

      // 2. Calculate liters_consumed = distance_km / km_per_l
      const liters_consumed = Number((distance_km / km_per_l).toFixed(2));

      // 3. Insert into fuel_logs (now includes iso_year for year-safe week lookup)
      await pool.query(
        'INSERT INTO fuel_logs (vehicle_id, iso_year, week_number, distance_run_km, liters_consumed) VALUES ($1, $2, $3, $4, $5)',
        [vehicle_id.trim(), iso_year, week_number, distance_km, liters_consumed]
      );

      res.status(200).json({
        success: true,
        data: { vehicle_id: vehicle_id.trim(), distance_km, liters_consumed },
      });
    } catch (error) {
      console.error('[fleet-directory] Error logging distance:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to record vehicle distance in database',
        },
      });
    }
  }

  // -------------------------------------------------------------------------

  /**
   * GET /vehicles/fuel-usage?iso_year=&iso_week=
   * Returns per-vehicle fuel consumption and remaining quota for the given
   * ISO year + week. All vehicles are returned; those with no logs show 0 used.
   */
  static async getFuelUsage(
    req: Request,
    res: Response<
      ApiResponse<
        {
          vehicle_id: string;
          weekly_fuel_quota_l: number;
          fuel_used_l: number;
          fuel_remaining_l: number;
          km_used: number;
          km_left: number;
        }[]
      >
    >
  ): Promise<void> {
    const parsed = FuelUsageQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors.map((e) => e.message).join('; '),
        },
      });
      return;
    }

    try {
      const { iso_year, iso_week } = parsed.data;

      const result = await pool.query<FuelUsageRow>(
        `SELECT
          v.vehicle_id,
          v.weekly_fuel_quota_l,
          v.km_per_l,
          COALESCE(SUM(fl.distance_run_km), 0)                                   AS km_used,
          COALESCE(SUM(fl.liters_consumed), 0)                                   AS fuel_used_l,
          v.weekly_fuel_quota_l - COALESCE(SUM(fl.liters_consumed), 0)           AS fuel_remaining_l,
          (v.weekly_fuel_quota_l - COALESCE(SUM(fl.liters_consumed), 0))
            * v.km_per_l                                                         AS km_left
        FROM vehicles v
        LEFT JOIN fuel_logs fl
          ON  fl.vehicle_id  = v.vehicle_id
          AND fl.iso_year    = $1
          AND fl.week_number = $2
        GROUP BY v.vehicle_id, v.weekly_fuel_quota_l, v.km_per_l
        ORDER BY v.vehicle_id ASC`,
        [iso_year, iso_week]
      );

      res.status(200).json({
        success: true,
        data: result.rows.map((row) => ({
          vehicle_id:          row.vehicle_id,
          weekly_fuel_quota_l: Number(row.weekly_fuel_quota_l),
          fuel_used_l:         Number(Number(row.fuel_used_l).toFixed(2)),
          fuel_remaining_l:    Number(Number(row.fuel_remaining_l).toFixed(2)),
          km_used:             Number(Number(row.km_used).toFixed(2)),
          km_left:             Number(Number(row.km_left).toFixed(2)),
        })),
      });
    } catch (error) {
      console.error('[fleet-directory] Error fetching fuel usage:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to retrieve fuel usage from database',
        },
      });
    }
  }

  // -------------------------------------------------------------------------

  /**
   * PATCH /vehicles/:vehicle_id/status
   * Body: { status: "available" | "in_workshop" }
   */
  static async updateVehicleStatus(
    req: Request<{ vehicle_id: string }>,
    res: Response<ApiResponse<Vehicle>>
  ): Promise<void> {
    try {
      const { vehicle_id } = req.params;
      const { status } = req.body;

      if (status !== 'available' && status !== 'in_workshop') {
        res.status(400).json({
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: "Invalid status value. Must be 'available' or 'in_workshop'",
          },
        });
        return;
      }

      const result = await pool.query<VehicleRow>(
        'UPDATE vehicles SET status = $1 WHERE vehicle_id = $2 RETURNING *',
        [status, vehicle_id]
      );

      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Vehicle with ID '${vehicle_id}' does not exist`,
          },
        });
        return;
      }

      res.status(200).json({ success: true, data: mapVehicleRow(result.rows[0]) });
    } catch (error) {
      console.error('[fleet-directory] Error updating vehicle status:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to update vehicle status in database',
        },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Downtime CRUD
  // -------------------------------------------------------------------------

  /**
   * POST /vehicles/:vehicle_id/downtime
   * Body: { date_from: YYYY-MM-DD, date_to: YYYY-MM-DD, reason?: string }
   */
  static async createDowntime(
    req: Request<{ vehicle_id: string }>,
    res: Response<ApiResponse<DowntimeRow>>
  ): Promise<void> {
    const { vehicle_id } = req.params;

    const parsed = VehicleDowntimeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors.map((e) => e.message).join('; '),
        },
      });
      return;
    }

    try {
      // Verify vehicle exists
      const vehicleCheck = await pool.query(
        'SELECT 1 FROM vehicles WHERE vehicle_id = $1',
        [vehicle_id]
      );
      if (vehicleCheck.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: {
            code: 'VEHICLE_NOT_FOUND',
            message: `Vehicle with ID '${vehicle_id}' not found`,
          },
        });
        return;
      }

      const { date_from, date_to, reason } = parsed.data;
      const result = await pool.query<DowntimeRow>(
        `INSERT INTO vehicle_downtime (vehicle_id, date_from, date_to, reason)
         VALUES ($1, $2, $3, $4)
         RETURNING id, vehicle_id, date_from::text, date_to::text, reason, created_at::text`,
        [vehicle_id, date_from, date_to, reason ?? null]
      );

      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      console.error('[fleet-directory] Error creating downtime:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to create downtime booking',
        },
      });
    }
  }

  // -------------------------------------------------------------------------

  /**
   * GET /vehicles/:vehicle_id/downtime
   * Lists all downtime bookings for a vehicle, ordered by date_from.
   */
  static async getDowntime(
    req: Request<{ vehicle_id: string }>,
    res: Response<ApiResponse<DowntimeRow[]>>
  ): Promise<void> {
    const { vehicle_id } = req.params;

    try {
      const vehicleCheck = await pool.query(
        'SELECT 1 FROM vehicles WHERE vehicle_id = $1',
        [vehicle_id]
      );
      if (vehicleCheck.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: {
            code: 'VEHICLE_NOT_FOUND',
            message: `Vehicle with ID '${vehicle_id}' not found`,
          },
        });
        return;
      }

      const result = await pool.query<DowntimeRow>(
        `SELECT id, vehicle_id, date_from::text, date_to::text, reason, created_at::text
         FROM vehicle_downtime
         WHERE vehicle_id = $1
         ORDER BY date_from ASC`,
        [vehicle_id]
      );

      res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
      console.error('[fleet-directory] Error fetching downtime:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to retrieve downtime bookings',
        },
      });
    }
  }

  // -------------------------------------------------------------------------

  /**
   * DELETE /vehicles/:vehicle_id/downtime/:id
   * Removes a specific downtime booking.
   */
  static async deleteDowntime(
    req: Request<{ vehicle_id: string; id: string }>,
    res: Response<ApiResponse<{ deleted: true }>>
  ): Promise<void> {
    const { vehicle_id, id } = req.params;

    try {
      const result = await pool.query(
        'DELETE FROM vehicle_downtime WHERE id = $1 AND vehicle_id = $2 RETURNING id',
        [id, vehicle_id]
      );

      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Downtime booking '${id}' not found for vehicle '${vehicle_id}'`,
          },
        });
        return;
      }

      res.status(200).json({ success: true, data: { deleted: true } });
    } catch (error) {
      console.error('[fleet-directory] Error deleting downtime:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to delete downtime booking',
        },
      });
    }
  }
}
