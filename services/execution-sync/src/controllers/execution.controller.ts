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
  StopEventsSchema,
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

  // B1a. The driver pressed "Start Trip"
  static async startDriverTrip(req: Request, res: Response) {
    try {
      return res.json({ success: true, data: await ExecutionSyncService.startDriverTrip(req.params.tripId, req.user) });
    } catch (err: any) {
      return sendError(res, err);
    }
  }

  // B1b. The driver marked "I've Arrived" at the depot: the trip is ready to load
  static async arriveAtDepot(req: Request, res: Response) {
    try {
      return res.json({ success: true, data: await ExecutionSyncService.arriveAtDepot(req.params.tripId, req.user) });
    } catch (err: any) {
      return sendError(res, err);
    }
  }

  // B1d. The driver leaves the depot (only once the truck is released)
  static async departFromDepot(req: Request, res: Response) {
    try {
      return res.json({ success: true, data: await ExecutionSyncService.departFromDepot(req.params.tripId, req.user, req.headers.authorization) });
    } catch (err: any) {
      return sendError(res, err);
    }
  }

  // B1c. Arrivals at and departures from stops (one, or a queued backlog)
  static async recordStopEvents(req: Request, res: Response) {
    try {
      const { events } = StopEventsSchema.parse(req.body);
      return res.json({ success: true, data: await ExecutionSyncService.recordStopEvents(events, req.user) });
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
  static async listArrivals(req: Request, res: Response) {
    try {
      return res.json({ success: true, data: await ExecutionSyncService.listArrivals(req.params.outletId) });
    } catch (err: any) {
      return sendError(res, err);
    }
  }

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
