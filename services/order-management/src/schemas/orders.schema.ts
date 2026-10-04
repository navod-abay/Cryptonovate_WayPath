import { z } from 'zod';
import { env } from '../config/env.js';
import { isValidIsoDate } from '../domain/calendar.js';
import { ORDER_STATUSES } from '../domain/statusMachine.js';

// Vocabulary mirrors packages/shared-types/src/schemas/domain.schema.ts (not importable
// from inside this service's Docker build context).
export const BrandEnum = z.enum(['Fresh', 'Style', 'Tech']);
export const DepotEnum = z.enum(['Peliyagoda', 'Kandy']);
export const DockTypeEnum = z.enum(['rear_dock', 'street', 'mall_bay']);
export const ParkingConstraintEnum = z.enum(['normal', 'van_only', 'mall_dock']);
export const TempRequirementEnum = z.enum(['ambient', 'chilled']);
export const OrderStatusEnum = z.enum(ORDER_STATUSES);

export type Brand = z.infer<typeof BrandEnum>;
export type Depot = z.infer<typeof DepotEnum>;
export type DockType = z.infer<typeof DockTypeEnum>;
export type ParkingConstraint = z.infer<typeof ParkingConstraintEnum>;
export type TempRequirement = z.infer<typeof TempRequirementEnum>;

export const isoDate = z
  .string()
  .trim()
  .refine(isValidIsoDate, { message: 'Must be a valid date in YYYY-MM-DD format' });

const outletId = z.string().trim().min(1, 'outlet_id is required').max(20);
const trimmedNote = z.string().trim().max(1000);

// Bounds follow the column types: NUMERIC(8,3) / NUMERIC(8,4), INTEGER.
export const OrderItemInputSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(1, 'sku is required')
    .max(40)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._\-/]*$/, 'sku may contain letters, digits and . _ - /'),
  description: z.string().trim().min(1, 'description is required').max(200),
  quantity: z.number().int('quantity must be a whole number').positive('quantity must be greater than 0').max(1_000_000),
  unit_weight_kg: z.number().nonnegative().max(99_999.999),
  unit_volume_m3: z.number().nonnegative().max(9_999.9999),
  is_chilled: z.boolean().default(false),
});
export type OrderItemInput = z.infer<typeof OrderItemInputSchema>;

const ItemsSchema = z
  .array(OrderItemInputSchema)
  .max(500, 'An order may contain at most 500 lines')
  .superRefine((items, ctx) => {
    const seen = new Map<string, number>();
    items.forEach((item, i) => {
      const key = item.sku.toUpperCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [i, 'sku'],
          message: `Duplicate sku '${item.sku}' (also at index ${seen.get(key)}); combine the quantities into one line`,
        });
      } else {
        seen.set(key, i);
      }
    });
  });

export const CreateOrderSchema = z.object({
  outlet_id: outletId,
  temp_requirement: TempRequirementEnum,
  order_date: isoDate.optional(),
  items: ItemsSchema.default([]),
});
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

export const ReplaceItemsSchema = z.object({
  items: ItemsSchema,
});

export const ConfirmOrderSchema = z.object({
  accept_next_run: z.boolean().default(false),
});

export const CancelOrderSchema = z.object({
  reason_note: trimmedNote.optional(),
});

export const DeferOrderSchema = z.object({
  // Validated in the service so a missing/unknown code yields 422 DEFERRAL_REASON_REQUIRED.
  reason_code: z.string().trim().optional(),
  reason_note: trimmedNote.optional(),
});

export const StatusUpdateSchema = z.object({
  order_ref: z.string().trim().min(1).max(32),
  status: OrderStatusEnum,
  // Cross-field rules (allocated needs vehicle_id + trip_id ∈ {1,2}) are enforced per entry
  // in the service so they land in details.failures[] and the batch stays all-or-nothing.
  vehicle_id: z.string().trim().max(20).optional(),
  trip_id: z.number().int().optional(),
  reason_code: z.string().trim().optional(),
  reason_note: trimmedNote.optional(),
});
export type StatusUpdateInput = z.infer<typeof StatusUpdateSchema>;

/** Body of PATCH /:order_ref/status — one StatusUpdate without the ref (it is in the path). */
export const StatusChangeSchema = StatusUpdateSchema.omit({ order_ref: true });
export type StatusChangeInput = z.infer<typeof StatusChangeSchema>;

export const StatusBatchSchema = z.object({
  updates: z.array(StatusUpdateSchema).min(1, 'updates must contain at least one entry').max(500, 'At most 500 updates per call'),
});

export const ReceiptLineSchema = z.object({
  sku: z.string().trim().min(1).max(50),
  // damaged units count towards rejected_units, missing units towards missing_units.
  kind: z.enum(['missing', 'damaged']),
  quantity: z.number().int().positive(),
  reasons: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
});
export type ReceiptLine = z.infer<typeof ReceiptLineSchema>;

export const ReceiptSchema = z.object({
  received_units: z.number().int().nonnegative(),
  missing_units: z.number().int().nonnegative().default(0),
  rejected_units: z.number().int().nonnegative().default(0),
  note: trimmedNote.optional(),
  // Optional per-item breakdown. When present its totals must match missing_units / rejected_units.
  lines: z.array(ReceiptLineSchema).max(200).default([]),
});
export type ReceiptInput = z.infer<typeof ReceiptSchema>;

export const CloseWindowSchema = z.object({
  date: isoDate.optional(),
});

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:MM');

/** Demo history: planned times per order for a past day (Planning & Allocation sends its plan). */
export const SimulateDeliverySchema = z.object({
  date: isoDate,
  deliveries: z
    .array(z.object({ order_ref: z.string().trim().min(1).max(32), departure_time: hhmm, arrival_time: hhmm }))
    .max(2000)
    .default([]),
});
export type SimulateDeliveryInput = z.infer<typeof SimulateDeliverySchema>;

// ---------------------------------------------------------------- query schemas

const csvOrRepeated = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess((val) => {
    if (val === undefined || val === '') return undefined;
    const list = Array.isArray(val) ? val : [val];
    return list.flatMap((v) => (typeof v === 'string' ? v.split(',') : [v])).map((v) => (typeof v === 'string' ? v.trim() : v));
  }, z.array(item).optional());

const optionalQueryString = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((val) => (val === '' ? undefined : val), schema.optional());

export const ListOrdersQuerySchema = z
  .object({
    outlet_id: optionalQueryString(outletId),
    depot: optionalQueryString(DepotEnum),
    brand: optionalQueryString(BrandEnum),
    status: csvOrRepeated(OrderStatusEnum),
    temp_requirement: optionalQueryString(TempRequirementEnum),
    from: optionalQueryString(isoDate),
    to: optionalQueryString(isoDate),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    page_size: z.coerce.number().int().min(1).max(200).default(50),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: "'from' must be on or before 'to'", path: ['from'] });
export type ListOrdersQuery = z.infer<typeof ListOrdersQuerySchema>;

export const ConfirmedQuerySchema = z.object({
  date: isoDate,
  depot: optionalQueryString(DepotEnum),
});

export const SummaryQuerySchema = z.object({
  date: optionalQueryString(isoDate),
  depot: optionalQueryString(DepotEnum),
});

export const DispatcherOverviewQuerySchema = z.object({
  date: isoDate,
  depot: optionalQueryString(DepotEnum),
});

// Bounded so a typo in the range cannot ask for years of windows.
export const MAX_WINDOW_DAYS = 62;
export const OrderWindowsQuerySchema = z
  .object({ from: isoDate, to: isoDate })
  .refine((q) => q.from <= q.to, { message: "'from' must be on or before 'to'", path: ['from'] })
  .refine((q) => Date.parse(q.to) - Date.parse(q.from) < MAX_WINDOW_DAYS * 86_400_000, {
    message: `The range may cover at most ${MAX_WINDOW_DAYS} days`,
    path: ['to'],
  });

export const AtRiskQuerySchema = z.object({
  depot: optionalQueryString(DepotEnum),
  min_deferrals: z.coerce.number().int().min(1).max(50).default(2),
  min_days: z.coerce.number().int().min(1).max(365).default(env.AT_RISK_DAYS),
});
