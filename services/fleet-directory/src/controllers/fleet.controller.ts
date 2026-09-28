import { Request, Response } from 'express';
import {
  Vehicle,
  Outlet,
  DistrictTravel,
  ServiceAllowance,
  ApiResponse,
  BatchOutletsRequestSchema,
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

interface OutletRow {
  outlet_id: string;
  brand: Outlet['brand'];
  district: string;
  depot: Outlet['depot'];
  dock_type: Outlet['dock_type'];
  parking_constraint: Outlet['parking_constraint'];
  mall_window: string | null;
  window_open_time: string | null;
  window_close_time: string | null;
}

interface DistrictTravelRow {
  district: string;
  depot: DistrictTravel['depot'];
  road_class: DistrictTravel['road_class'];
  free_flow_kmh: number | string;
  depot_to_district_km: number | string;
  depot_to_district_freeflow_min: number | string;
  inter_stop_km: number | string;
  inter_stop_freeflow_min: number | string;
}

interface ServiceAllowanceRow {
  brand: ServiceAllowance['brand'];
  dock_type: ServiceAllowance['dock_type'];
  service_allowance_min: number | string;
}

interface VehicleEfficiencyRow {
  km_per_l: number | string;
}

export class FleetController {
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
   * POST /outlets/batch
   * Body: { outlet_ids: string[] }
   */
  static async getOutletsBatch(
    req: Request,
    res: Response<ApiResponse<Outlet[]>>
  ): Promise<void> {
    try {
      const validationResult = BatchOutletsRequestSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request payload: outlet_ids must be an array of non-empty strings',
          },
        });
        return;
      }

      const { outlet_ids } = validationResult.data;
      if (outlet_ids.length === 0) {
        res.status(200).json({
          success: true,
          data: [],
        });
        return;
      }

      const sql = `
        SELECT 
          outlet_id, 
          brand, 
          district, 
          depot, 
          dock_type, 
          parking_constraint, 
          mall_window, 
          to_char(window_open_time, 'HH24:MI') as window_open_time, 
          to_char(window_close_time, 'HH24:MI') as window_close_time 
        FROM outlets 
        WHERE outlet_id = ANY($1::varchar[])
        ORDER BY outlet_id ASC
      `;

      const result = await pool.query<OutletRow>(sql, [outlet_ids]);

      const outlets: Outlet[] = result.rows.map((row: OutletRow) => ({
        outlet_id: row.outlet_id,
        brand: row.brand,
        district: row.district,
        depot: row.depot,
        dock_type: row.dock_type,
        parking_constraint: row.parking_constraint,
        mall_window: row.mall_window ?? null,
        window_open_time: row.window_open_time ? String(row.window_open_time).slice(0, 5) : null,
        window_close_time: row.window_close_time ? String(row.window_close_time).slice(0, 5) : null,
      }));

      res.status(200).json({
        success: true,
        data: outlets,
      });
    } catch (error) {
      console.error('[fleet-directory] Error fetching outlets batch:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to retrieve outlets from database',
        },
      });
    }
  }

  /**
   * GET /travel-metrics
   * Concurrently queries district_travel and service_allowance
   */
  static async getTravelMetrics(
    req: Request,
    res: Response<
      ApiResponse<{
        district_travel: DistrictTravel[];
        service_allowances: ServiceAllowance[];
      }>
    >
  ): Promise<void> {
    try {
      const [districtTravelResult, serviceAllowanceResult] = await Promise.all([
        pool.query<DistrictTravelRow>(
          'SELECT district, depot, road_class, free_flow_kmh, depot_to_district_km, depot_to_district_freeflow_min, inter_stop_km, inter_stop_freeflow_min FROM district_travel ORDER BY district, depot'
        ),
        pool.query<ServiceAllowanceRow>(
          'SELECT brand, dock_type, service_allowance_min FROM service_allowance ORDER BY brand, dock_type'
        ),
      ]);

      const district_travel: DistrictTravel[] = districtTravelResult.rows.map(
        (row: DistrictTravelRow) => ({
          district: row.district,
          depot: row.depot,
          road_class: row.road_class,
          free_flow_kmh: Number(row.free_flow_kmh),
          depot_to_district_km: Number(row.depot_to_district_km),
          depot_to_district_freeflow_min: Number(row.depot_to_district_freeflow_min),
          inter_stop_km: Number(row.inter_stop_km),
          inter_stop_freeflow_min: Number(row.inter_stop_freeflow_min),
        })
      );

      const service_allowances: ServiceAllowance[] = serviceAllowanceResult.rows.map(
        (row: ServiceAllowanceRow) => ({
          brand: row.brand,
          dock_type: row.dock_type,
          service_allowance_min: Number(row.service_allowance_min),
        })
      );

      res.status(200).json({
        success: true,
        data: {
          district_travel,
          service_allowances,
        },
      });
    } catch (error) {
      console.error('[fleet-directory] Error fetching travel metrics:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to retrieve travel metrics from database',
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
}
