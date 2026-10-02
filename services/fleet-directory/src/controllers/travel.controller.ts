import { Request, Response } from 'express';
import {
  DistrictTravel,
  ServiceAllowance,
  ApiResponse,
} from '@waypoint/shared-types';
import { pool } from '../db/pool';

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

export class TravelController {
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
}
