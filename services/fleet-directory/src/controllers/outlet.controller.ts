import { Request, Response } from 'express';
import {
  Outlet,
  ApiResponse,
  BatchOutletsRequestSchema,
} from '../contracts';
import { pool } from '../db/pool';

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
  name: string | null;
  address: string | null;
}

export class OutletController {
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
      // A store manager may only look up their own outlet.
      const user = req.user;
      if (user?.role === 'store_manager' && outlet_ids.some((id) => id !== user.outlet_id)) {
        res.status(403).json({
          success: false,
          error: {
            code: 'OUTLET_SCOPE_VIOLATION',
            message: `Store manager for ${user.outlet_id ?? 'no outlet'} may only look up their own outlet`,
          },
        });
        return;
      }
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
          to_char(window_close_time, 'HH24:MI') as window_close_time,
          name,
          address
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
        name: row.name ?? null,
        address: row.address ?? null,
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
}
