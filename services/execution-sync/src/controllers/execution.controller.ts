import { Request, Response } from 'express';
import { ExecutionSyncService } from '../services/sync.service';
import {
  ShortfallSchema,
  DispatchSchema,
  TelemetrySchema,
  PodSchema,
  BulkSyncSchema,
  ConfirmOrderSchema,
  DisputeOrderSchema,
} from '../schemas/execution.schema';

export class ExecutionController {
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
      const podResult = await ExecutionSyncService.recordPod(stopId, validatedData, driverId);
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
      const driverId = req.user?.userId;
      const syncSummary = await ExecutionSyncService.processBulkSync(validatedData, driverId);
      return res.json({ success: true, data: syncSummary });
    } catch (err: any) {
      if (err.name === 'ZodError') {
        return res.status(400).json({ success: false, error: 'Validation Error', details: err.errors });
      }
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // D1. Confirm Order Receipt
  static async confirmOrder(req: Request, res: Response) {
    try {
      const { orderRef } = req.params;
      const validatedData = ConfirmOrderSchema.parse(req.body);
      const storeManagerId = req.user?.userId;
      const confirmation = await ExecutionSyncService.confirmOrder(orderRef, storeManagerId, validatedData.notes);
      return res.json({ success: true, data: confirmation });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // D2. Dispute Order Receipt
  static async disputeOrder(req: Request, res: Response) {
    try {
      const { orderRef } = req.params;
      const validatedData = DisputeOrderSchema.parse(req.body);
      const storeManagerId = req.user?.userId;
      const dispute = await ExecutionSyncService.disputeOrder(
        orderRef,
        storeManagerId,
        validatedData.discrepancyType,
        validatedData.description
      );
      return res.status(201).json({ success: true, data: dispute });
    } catch (err: any) {
      if (err.name === 'ZodError') {
        return res.status(400).json({ success: false, error: 'Validation Error', details: err.errors });
      }
      return res.status(500).json({ success: false, error: err.message });
    }
  }
}
