import { Request, Response } from 'express';
import { ExecutionError, ExecutionSyncService, HttpError } from '../services/sync.service';
import { LoadingService } from '../services/loading.service';
import {
  ShortfallSchema,
  ScanSchema,
  DispatchSchema,
  TelemetrySchema,
  PodSchema,
  BulkSyncSchema,
  HandoverSchema,
  DriverIncidentsSchema,
  DeliveryProblemSchema,
} from '../schemas/execution.schema';

/** Validation -> 400, HttpError -> its status (with details), anything else -> 500. */
function sendError(res: Response, err: any) {
  if (err?.name === 'ZodError') {
    return res.status(400).json({ success: false, error: 'Validation Error', details: err.errors });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ success: false, error: err.message, ...(err.details ? { details: err.details } : {}) });
  }
  return res.status(500).json({ success: false, error: err?.message ?? 'Unexpected error' });
}

export class ExecutionController {
  // A0. Get the loader's queue: their assigned trips at the depot
  static async getActiveTrips(req: Request, res: Response) {
    try {
      const { depot } = req.params;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const date = typeof req.query.date === 'string' ? req.query.date : undefined;
      const trips = await ExecutionSyncService.getActiveTrips(depot, req.user, status, date);
      return res.json({ success: true, data: trips });
    } catch (err: any) {
      return res.status(err instanceof HttpError ? err.status : 500).json({ success: false, error: err.message });
    }
  }

  // A1. Get LIFO Manifest
  static async getManifest(req: Request, res: Response) {
    try {
      const { tripId } = req.params;
      const manifest = await ExecutionSyncService.getLIFOManifest(tripId, req.user);
      return res.json({ success: true, data: manifest });
    } catch (err: any) {
      return res.status(err instanceof HttpError ? err.status : 500).json({ success: false, error: err.message });
    }
  }

  // A2. Start Loading: the trip moves to the loader's "loading" queue
  static async startLoading(req: Request, res: Response) {
    try {
      return res.json({ success: true, data: await LoadingService.start(req.params.tripId, req.user) });
    } catch (err: any) {
      return sendError(res, err);
    }
  }

  // A3. One unit label scanned at the truck
  static async recordScan(req: Request, res: Response) {
    try {
      const { barcode } = ScanSchema.parse(req.body);
      const scan = await LoadingService.scan(req.params.tripId, barcode, req.user, req.headers.authorization);
      return res.status(scan.status === 'scanned' ? 201 : 200).json({ success: true, data: scan });
    } catch (err: any) {
      return sendError(res, err);
    }
  }

  // A4. Record Loading Shortfall (missing or damaged units)
  static async recordShortfall(req: Request, res: Response) {
    try {
      const validatedData = ShortfallSchema.parse(req.body);
      const shortfall = await LoadingService.reportShortfall(req.params.tripId, validatedData, req.user, req.headers.authorization);
      return res.status(201).json({ success: true, data: shortfall });
    } catch (err: any) {
      return sendError(res, err);
    }
  }

  // A5. Complete Dispatch
  static async completeDispatch(req: Request, res: Response) {
    try {
      const { tripId } = req.params;
      const validatedData = DispatchSchema.parse(req.body);
      // A loader always dispatches as themselves; a dispatcher may record the loader who did it.
      const loaderId = req.user?.role === 'loader' ? req.user.userId : validatedData.loaderId || req.user?.userId;
      const manifest = await LoadingService.dispatch(tripId, req.user, loaderId, req.headers.authorization);
      return res.json({ success: true, data: manifest });
    } catch (err: any) {
      return sendError(res, err);
    }
  }

  // B1. The driver's trips for the day (their vehicle's plan)
  static async getActiveRoute(req: Request, res: Response) {
    try {
      const date = typeof req.query.date === 'string' ? req.query.date : undefined;
      const vehicleId = typeof req.query.vehicleId === 'string' ? req.query.vehicleId : undefined;
      return res.json({ success: true, data: await ExecutionSyncService.getDriverTrips(req.user, date, vehicleId) });
    } catch (err: any) {
      return sendError(res, err);
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

  // D1a. Store manager issues or retrieves the active delivery handover code.
  static async issueHandover(req: Request, res: Response) {
    try {
      const result = await ExecutionSyncService.confirmOrder(req.params.deliveryId, req.headers.authorization);
      return res.json({ success: true, data: { ...result, deliveryId: req.params.deliveryId, status: 'handover_pending' } });
    } catch (err: any) {
      return sendError(res, err);
    }
  }

  static async getHandoverStatus(req: Request, res: Response) {
    try {
      const result = await ExecutionSyncService.getHandoverStatus(req.params.deliveryId, req.headers.authorization);
      return res.json({ success: true, data: result });
    } catch (err: any) {
      return sendError(res, err);
    }
  }

  // D1b. Driver verifies the delivery handover code.
  static async verifyHandover(req: Request, res: Response) {
    try {
      const { code, completedAt } = HandoverSchema.parse(req.body);
      const idempotencyKey = typeof req.headers['idempotency-key'] === 'string'
        ? req.headers['idempotency-key']
        : undefined;
      const result = await ExecutionSyncService.completeHandover(
        req.params.deliveryId,
        code,
        req.headers.authorization,
        req.user,
        idempotencyKey,
        completedAt,
      );
      return res.json({ success: true, data: result });
    } catch (err: any) {
      return sendError(res, err);
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
