import { Request, Response } from 'express';
import {
  Vehicle,
  ApiResponse,
  LogDistanceRequestSchema,
} from '@waypoint/shared-types';
import { pool } from '../db/pool';

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
  status: Vehicle['status'];
}

interface VehicleEfficiencyRow {
  km_per_l: number | string;
}

export class VehicleController {
  /**
   * GET /vehicles
   * Query params: depot (optional), status (optional)
   */
  static async getVehicles(
    req: Request,
    res: Response<ApiResponse<Vehicle[]>>
  ): Promise<void> {
    try {
      const { depot, status } = req.query;
      const conditions: string[] = [];
      const values: (string | number)[] = [];

      if (typeof depot === 'string' && depot.trim().length > 0) {
        values.push(depot.trim());
        conditions.push(`depot = $${values.length}`);
      }

      if (typeof status === 'string' && status.trim().length > 0) {
        values.push(status.trim());
        conditions.push(`status = $${values.length}`);
      }

      let sql =
        'SELECT vehicle_id, type, temp, weight_cap_kg, volume_cap_m3, fuel_type, km_per_l, weekly_fuel_quota_l, depot, status FROM vehicles';
      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
      sql += ' ORDER BY vehicle_id ASC';

      const result = await pool.query<VehicleRow>(sql, values);

      const vehicles: Vehicle[] = result.rows.map((row: VehicleRow) => ({
        vehicle_id: row.vehicle_id,
        type: row.type,
        temp: row.temp,
        weight_cap_kg: Number(row.weight_cap_kg),
        volume_cap_m3: Number(row.volume_cap_m3),
        fuel_type: row.fuel_type,
        km_per_l: Number(row.km_per_l),
        weekly_fuel_quota_l: Number(row.weekly_fuel_quota_l),
        depot: row.depot,
        status: row.status,
      }));

      res.status(200).json({
        success: true,
        data: vehicles,
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

  /**
   * POST /vehicles/:vehicle_id/log-distance
   * Body: { distance_km: number, week_number: number }
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
          error: {
            code: 'VALIDATION_ERROR',
            message: 'vehicle_id parameter is required',
          },
        });
        return;
      }

      const validationResult = LogDistanceRequestSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message:
              'Invalid request payload: distance_km must be a positive number and week_number must be a valid ISO week',
          },
        });
        return;
      }

      const { distance_km, week_number } = validationResult.data;

      // 1. Query the vehicles table for vehicle_id to retrieve its km_per_l
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

      // 3. Insert a new record into fuel_logs
      await pool.query(
        'INSERT INTO fuel_logs (vehicle_id, week_number, distance_run_km, liters_consumed) VALUES ($1, $2, $3, $4)',
        [vehicle_id.trim(), week_number, distance_km, liters_consumed]
      );

      res.status(200).json({
        success: true,
        data: {
          vehicle_id: vehicle_id.trim(),
          distance_km,
          liters_consumed,
        },
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

      const row = result.rows[0];
      const vehicle: Vehicle = {
        vehicle_id: row.vehicle_id,
        type: row.type,
        temp: row.temp,
        weight_cap_kg: Number(row.weight_cap_kg),
        volume_cap_m3: Number(row.volume_cap_m3),
        fuel_type: row.fuel_type,
        km_per_l: Number(row.km_per_l),
        weekly_fuel_quota_l: Number(row.weekly_fuel_quota_l),
        depot: row.depot,
        status: row.status,
      };

      res.status(200).json({
        success: true,
        data: vehicle,
      });
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
}
