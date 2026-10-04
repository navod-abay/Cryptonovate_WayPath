import { Request, Response } from 'express';
import { ExecutionError, ExecutionSyncService } from '../services/sync.service';
import {
  ShortfallSchema,
  DispatchSchema,
  TelemetrySchema,
  PodSchema,
  BulkSyncSchema,
  HandoverSchema,
  DriverIncidentsSchema,
  DeliveryProblemSchema,
} from '../schemas/execution.schema';

export class ExecutionController {
  // A0. Get Active Trips for Dock
  static async getActiveTrips(req: Request, res: Response) {
    try {
      const { depot } = req.params;
      const { status } = req.query;
      const trips = await ExecutionSyncService.getActiveTrips(depot, status as string);
      return res.json({ success: true, data: trips });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // A1. Get LIFO Manifest
  static async getManifest(req: Request, res: Response) {
    try {
      const { tripId } = req.params;
      const manifest = await ExecutionSyncService.getLIFOManifest(tripId);
      return res.json({ success: true, data: manifest });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // A2. Record Loading Shortfall
  static async recordShortfall(req: Request, res: Response) {
    try {
      const { tripId } = req.params;
      const validatedData = ShortfallSchema.parse(req.body);
      const shortfall = await ExecutionSyncService.recordShortfall(tripId, validatedData);
      return res.status(201).json({ success: true, data: shortfall });
    } catch (err: any) {
      if (err.name === 'ZodError') {
        return res.status(400).json({ success: false, error: 'Validation Error', details: err.errors });
      }
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // A3. Complete Dispatch
  static async completeDispatch(req: Request, res: Response) {
    try {
      const { tripId } = req.params;
      const validatedData = DispatchSchema.parse(req.body);
      const loaderId = validatedData.loaderId || req.user?.userId;
      const manifest = await ExecutionSyncService.completeDispatch(tripId, loaderId);
      return res.json({ success: true, data: manifest });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // B1. Get Active Driver Route
  static async getActiveRoute(req: Request, res: Response) {
    try {
      const driverId = req.user?.userId || 'drv_default';
      const activeRoute = {
        driverId,
        routeId: 'ROUTE-2026-001',
        status: 'in_transit',
        stops: [
          { stopId: 'STOP-1', outletId: 'OUTLET-001', orderRef: 'ORD-1001', address: '123 Main St, Colombo' },
          { stopId: 'STOP-2', outletId: 'OUTLET-002', orderRef: 'ORD-1002', address: '45 Galle Rd, Dehiwala' },
        ],
      };
      return res.json({ success: true, data: activeRoute });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // B2. Push Driver Telemetry
  static async recordTelemetry(req: Request, res: Response) {
    try {
      const validatedData = TelemetrySchema.parse(req.body);
      const driverId = validatedData.driverId || req.user?.userId;
      const log = await ExecutionSyncService.recordTelemetry(
        driverId,
        validatedData.vehicleId,
        validatedData.lat,
        validatedData.lng,
        validatedData.speed,
        validatedData.recordedAt
      );
      return res.status(200).json({ success: true, data: log });
    } catch (err: any) {
      if (err.name === 'ZodError') {
        return res.status(400).json({ success: false, error: 'Validation Error', details: err.errors });
      }
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // B3. Record Stop POD
  static async recordPod(req: Request, res: Response) {
    try {
      const { stopId } = req.params;
      const validatedData = PodSchema.parse(req.body);
      const driverId = req.user?.userId;
      const podResult = await ExecutionSyncService.recordPod(stopId, validatedData, driverId, req.headers.authorization);
      return res.status(201).json({ success: true, data: podResult });
    } catch (err: any) {
      if (err.name === 'ZodError') {
        return res.status(400).json({ success: false, error: 'Validation Error', details: err.errors });
      }
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // C. Bulk Offline Sync
  static async bulkSync(req: Request, res: Response) {
    try {
      const validatedData = BulkSyncSchema.parse(req.body);
      const syncSummary = await ExecutionSyncService.processBulkSync(validatedData, req.user, req.headers.authorization);
      return res.json({ success: true, data: syncSummary });
    } catch (err: any) {
      if (err.name === 'ZodError') {
        return res.status(400).json({ success: false, error: 'Validation Error', details: err.errors });
      }
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // D0. Store manager starts unloading (vehicle at the outlet)
  static async startUnloading(req: Request, res: Response) {
    try {
      const { orderRef } = req.params;
      const { created, unloading } = await ExecutionSyncService.startUnloading(orderRef, req.headers.authorization, req.user?.userId);
      return res.status(created ? 201 : 200).json({ success: true, data: unloading });
    } catch (err: any) {
      if (err instanceof ExecutionError) {
        return res.status(err.status).json({ success: false, error: { code: err.code, message: err.message, details: err.details } });
      }
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: err.message } });
    }
  }

  // D0b. Orders of an outlet whose unloading has started
  static async listUnloadings(req: Request, res: Response) {
    try {
      const rows = await ExecutionSyncService.listUnloadings(req.params.outletId);
      return res.json({ success: true, data: rows });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: err.message } });
    }
  }

  // D1. Store manager taps Confirm Receipt: issue the handover code for the driver
  static async confirmOrder(req: Request, res: Response) {
    try {
      const confirmation = await ExecutionSyncService.confirmOrder(req.params.orderRef, req.headers.authorization);
      return res.json({ success: true, data: confirmation });
    } catch (err: any) {
      if (err instanceof ExecutionError) {
        return res.status(err.status).json({ success: false, error: { code: err.code, message: err.message, details: err.details } });
      }
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: err.message } });
    }
  }

  // D1b. Driver enters the handover code at the outlet
  static async handover(req: Request, res: Response) {
    try {
      const { code } = HandoverSchema.parse(req.body);
      const result = await ExecutionSyncService.completeHandover(req.params.orderRef, code, req.headers.authorization);
      return res.json({ success: true, data: result });
    } catch (err: any) {
      if (err.name === 'ZodError') {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: err.errors?.[0]?.message || 'Validation Error', details: err.errors } });
      }
      if (err instanceof ExecutionError) {
        return res.status(err.status).json({ success: false, error: { code: err.code, message: err.message, details: err.details } });
      }
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: err.message } });
    }
  }

  // B4. Driver Incident Reports (single or queued batch)
  static async reportDriverIncidents(req: Request, res: Response) {
    try {
      const incidents = DriverIncidentsSchema.parse(req.body);
      const result = await ExecutionSyncService.recordDriverIncidents(incidents, req.user);
      return res.status(result.accepted.length > 0 ? 201 : 200).json({ success: true, data: result });
    } catch (err: any) {
      if (err.name === 'ZodError') {
        return res.status(400).json({ success: false, error: 'Validation Error', details: err.errors });
      }
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // D2. Delivery Problem (delivery still on the way)
  static async reportDeliveryProblem(req: Request, res: Response) {
    try {
      const { deliveryId } = req.params;
      const validatedData = DeliveryProblemSchema.parse(req.body);
      const problem = await ExecutionSyncService.reportDeliveryProblem(deliveryId, validatedData, req.user);
      return res.status(201).json({ success: true, data: problem });
    } catch (err: any) {
      if (err.name === 'ZodError') {
        return res.status(400).json({ success: false, error: 'Validation Error', details: err.errors });
      }
      return res.status(500).json({ success: false, error: err.message });
    }
  }
}
