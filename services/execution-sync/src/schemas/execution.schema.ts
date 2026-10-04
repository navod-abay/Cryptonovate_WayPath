import { z } from 'zod';

/** Units of one order line that will not be loaded: missing from stock, or damaged and removed. */
export const ShortfallSchema = z.object({
  orderRef: z.string().min(1, 'Order reference is required'),
  sku: z.string().min(1, 'SKU is required'),
  missingQty: z.number().int().min(1, 'missingQty must be at least 1'),
  damageFlag: z.boolean().default(false),
  notes: z.string().max(500).optional(),
});

/** A unit label read by the camera or a handheld scanner: <orderRef>|<sku>|<unit>. */
export const ScanSchema = z.object({
  barcode: z.string().trim().min(1, 'barcode is required').max(120),
});

export const DispatchSchema = z.object({
  loaderId: z.string().uuid().optional(),
});

export const TelemetrySchema = z.object({
  driverId: z.string().optional(),
  vehicleId: z.string().optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  speed: z.number().min(0).optional(),
  recordedAt: z.string().datetime().optional(),
});

export const PodSchema = z.object({
  routeId: z.string().optional(),
  orderRef: z.string().min(1, 'Order reference is required'),
  outletId: z.string().optional(),
  status: z.enum(['delivered', 'partially_delivered', 'rejected', 'completed']).default('delivered'),
  podSignature: z.string().min(1, 'Proof of delivery signature is required'),
  notes: z.string().optional(),
  actualArrivalTime: z.string().datetime().optional(),
  actualDepartureTime: z.string().datetime().optional(),
  actualServiceDurationMin: z.number().int().min(0).optional(),
});

export const DeliveryEventSyncItemSchema = z.object({
  tripId: z.string().optional(),
  orderRef: z.string().min(1, 'Order reference is required'),
  outletId: z.string().optional(),
  actualArrivalTime: z.string().datetime().optional(),
  actualDepartureTime: z.string().datetime().optional(),
  actualServiceDurationMin: z.number().int().min(0).optional(),
  status: z.enum(['delivered', 'partially_delivered', 'rejected']).default('delivered'),
  podSignature: z.string().optional(),
  offlineCapturedAt: z.string().datetime({ message: 'offlineCapturedAt ISO timestamp is required' }),
});

export const TelemetrySyncItemSchema = z.object({
  driverId: z.string().optional(),
  vehicleId: z.string().optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  speed: z.number().min(0).optional(),
  recordedAt: z.string().datetime().optional(),
});

export const BulkSyncSchema = z.object({
  events: z.array(DeliveryEventSyncItemSchema).default([]),
  telemetry: z.array(TelemetrySyncItemSchema).default([]),
});

export const ConfirmOrderSchema = z.object({
  notes: z.string().optional(),
});

export const HandoverSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'The handover code is 6 digits'),
  completedAt: z.string().datetime().optional(),
});

export const DRIVER_ISSUES = ['no_receive', 'closed', 'refused', 'blocked'] as const;

export const DriverIncidentSchema = z.object({
  // Generated on the device when the report is made; re-sending it is a no-op.
  clientEventId: z.string().uuid('clientEventId must be a UUID'),
  tripId: z.string().max(50).optional(),
  stopId: z.string().max(50).optional(),
  outletId: z.string().max(50).optional(),
  orderRef: z.string().max(50).optional(),
  vehicleId: z.string().max(50).optional(),
  issue: z.enum(DRIVER_ISSUES),
  action: z.string().max(40).optional(),
  notes: z.string().max(1000).optional(),
  capturedAt: z.string().datetime({ offset: true, message: 'capturedAt ISO timestamp is required' }),
});

/** One report, or a queued backlog flushed after the driver regains signal. */
export const DriverIncidentsSchema = z.union([
  DriverIncidentSchema.transform((incident) => [incident]),
  z.object({ incidents: z.array(DriverIncidentSchema).min(1).max(100) }).transform((body) => body.incidents),
]);

export const DeliveryProblemSchema = z.object({
  problems: z.array(z.string().min(1).max(100)).min(1).max(10),
  orderRef: z.string().max(50).optional(),
});

export type ShortfallInput = z.infer<typeof ShortfallSchema>;
export type ScanInput = z.infer<typeof ScanSchema>;
export type TelemetryInput = z.infer<typeof TelemetrySchema>;
export type PodInput = z.infer<typeof PodSchema>;
export type BulkSyncInput = z.infer<typeof BulkSyncSchema>;
export type ConfirmOrderInput = z.infer<typeof ConfirmOrderSchema>;
export type DriverIncidentInput = z.infer<typeof DriverIncidentSchema>;
export type DeliveryProblemInput = z.infer<typeof DeliveryProblemSchema>;
