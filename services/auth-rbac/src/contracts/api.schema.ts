// Copied from the former packages/shared-types. This service owns its copy; the cross-service contract is openapi.yaml.
import { z } from 'zod';
import { DepotEnum, DistrictTravelSchema, ServiceAllowanceSchema } from './domain.schema.js';

/**
 * ============================================================================
 * AUTHENTICATION & RBAC API SCHEMAS
 * ============================================================================
 */
export const UserRoleEnum = z.enum(['dispatcher', 'loader', 'driver', 'store_manager']);
export type UserRole = z.infer<typeof UserRoleEnum>;

export const LoginRequestSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const UserProfileSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  role: UserRoleEnum,
  fullName: z.string(),
  outletId: z.string().nullable().optional(),
  depot: DepotEnum.nullable().optional(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const LoginResponseSchema = z.object({
  success: z.boolean(),
  access_token: z.string(),
  refresh_token: z.string(),
  user: UserProfileSchema,
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

/**
 * ============================================================================
 * PEAK DAY ALLOCATION API SCHEMAS
 * ============================================================================
 */
export const AllocationDecisionEnum = z.enum(['served', 'deferred']);

export const PeakDayAllocationRequestSchema = z.object({
  scenario: z.literal('S1', {
    errorMap: () => ({ message: 'Scenario must strictly be "S1"' }),
  }),
  order_ref: z.string().min(1, 'Order reference is required'),
  outlet_id: z.string().min(1, 'Outlet ID is required'),
  decision: AllocationDecisionEnum,
  vehicle_id: z.string().nullable().optional(),
  trip_id: z.union([z.literal(1), z.literal(2)], {
    errorMap: () => ({ message: 'trip_id must strictly be 1 or 2' }),
  }),
});
export type PeakDayAllocationRequest = z.infer<typeof PeakDayAllocationRequestSchema>;

/**
 * ============================================================================
 * EXECUTION SYNC & OFFLINE RECONCILIATION API SCHEMAS
 * ============================================================================
 */
export const DeliveryStatusEnum = z.enum(['completed', 'failed', 'partial', 'in_transit']);

export const ExecutionSyncRequestSchema = z.object({
  trip_id: z.number().int().positive('trip_id must be a positive integer'),
  order_ref: z.string().min(1, 'Order reference is required'),
  timestamps: z.object({
    event_timestamp: z.string().datetime({ message: 'event_timestamp must be a valid ISO datetime string' }),
    synced_at: z.string().datetime({ message: 'synced_at must be a valid ISO datetime string' }).optional(),
  }),
  delivery_status: DeliveryStatusEnum,
  geo_location: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .optional(),
});
export type ExecutionSyncRequest = z.infer<typeof ExecutionSyncRequestSchema>;

/**
 * ============================================================================
 * FLEET & DIRECTORY API SCHEMAS
 * ============================================================================
 */

export const BatchOutletsRequestSchema = z.object({
  outlet_ids: z.array(z.string().min(1, 'Outlet ID cannot be empty')),
});
export type BatchOutletsRequest = z.infer<typeof BatchOutletsRequestSchema>;

export const TravelMetricsResponseSchema = z.object({
  district_travel: z.array(DistrictTravelSchema),
  service_allowances: z.array(ServiceAllowanceSchema),
});
export type TravelMetricsResponse = z.infer<typeof TravelMetricsResponseSchema>;

export const LogDistanceRequestSchema = z.object({
  distance_km: z.number().positive('Distance must be a positive number'),
  week_number: z.number().int().positive('Week number must be a valid ISO week'),
});
export type LogDistanceRequest = z.infer<typeof LogDistanceRequestSchema>;

/**
 * ============================================================================
 * GENERIC API RESPONSE CONTRACTS
 * ============================================================================
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorDetail;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;