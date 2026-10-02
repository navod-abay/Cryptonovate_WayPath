import { z } from 'zod';

export const ShortfallSchema = z.object({
  orderRef: z.string().min(1, 'Order reference is required'),
  sku: z.string().min(1, 'SKU is required'),
  missingQty: z.number().int().min(0).default(0),
  damageFlag: z.boolean().default(false),
  notes: z.string().optional(),
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

export const DisputeOrderSchema = z.object({
  discrepancyType: z.string().min(1, 'Discrepancy type is required'),
  description: z.string().min(1, 'Discrepancy description is required'),
});

export type ShortfallInput = z.infer<typeof ShortfallSchema>;
export type TelemetryInput = z.infer<typeof TelemetrySchema>;
export type PodInput = z.infer<typeof PodSchema>;
export type BulkSyncInput = z.infer<typeof BulkSyncSchema>;
export type ConfirmOrderInput = z.infer<typeof ConfirmOrderSchema>;
export type DisputeOrderInput = z.infer<typeof DisputeOrderSchema>;
