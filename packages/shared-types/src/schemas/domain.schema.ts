import { z } from 'zod';

/**
 * Depot Location Enum
 */
export const DepotEnum = z.enum(['Peliyagoda', 'Kandy']);
export type Depot = z.infer<typeof DepotEnum>;

/**
 * Vehicle Entity Schema
 */
export const VehicleTypeEnum = z.enum(['truck', 'van']);
export const VehicleTempEnum = z.enum(['reefer', 'ambient']);
export const VehicleFuelEnum = z.enum(['diesel', 'petrol', 'electric']);
export const VehicleStatusEnum = z.enum(['available', 'in_workshop']);

export const VehicleSchema = z.object({
  vehicle_id: z.string().min(1, 'Vehicle ID is required'),
  type: VehicleTypeEnum,
  temp: VehicleTempEnum,
  weight_cap_kg: z.number().positive('Weight capacity must be greater than 0'),
  volume_cap_m3: z.number().positive('Volume capacity must be greater than 0'),
  fuel_type: VehicleFuelEnum,
  km_per_l: z.number().positive('Kilometers per liter must be positive'),
  weekly_fuel_quota_l: z.number().nonnegative('Weekly fuel quota cannot be negative'),
  depot: DepotEnum,
  status: VehicleStatusEnum,
});

export type Vehicle = z.infer<typeof VehicleSchema>;

/**
 * Outlet Entity Schema
 */
export const BrandEnum = z.enum(['Fresh', 'Style', 'Tech']);
export const DockTypeEnum = z.enum(['rear_dock', 'street', 'mall_bay']);
export const ParkingConstraintEnum = z.enum(['normal', 'van_only', 'mall_dock']);

const timeFormatRegex = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:mm format

export const OutletSchema = z.object({
  outlet_id: z.string().min(1, 'Outlet ID is required'),
  brand: BrandEnum,
  district: z.string().min(1, 'District is required'),
  depot: DepotEnum,
  dock_type: DockTypeEnum,
  parking_constraint: ParkingConstraintEnum,
  mall_window: z.string().nullable().optional(), // Fixed: Changed from boolean to string
  window_open_time: z.string().regex(timeFormatRegex, 'window_open_time must be HH:mm format').nullable().optional(),
  window_close_time: z.string().regex(timeFormatRegex, 'window_close_time must be HH:mm format').nullable().optional(),
});

export type Outlet = z.infer<typeof OutletSchema>;


export const RoadClassEnum = z.enum(['urban', 'suburban', 'highway', 'hill']);
export const DistrictTravelSchema = z.object({
  district: z.string().min(1),
  depot: DepotEnum,
  road_class: RoadClassEnum,
  free_flow_kmh: z.number().positive(),
  depot_to_district_km: z.number().nonnegative(),
  depot_to_district_freeflow_min: z.number().nonnegative(),
  inter_stop_km: z.number().nonnegative(),
  inter_stop_freeflow_min: z.number().nonnegative(),
});
export type DistrictTravel = z.infer<typeof DistrictTravelSchema>;


export const ServiceAllowanceSchema = z.object({
  brand: BrandEnum,
  dock_type: DockTypeEnum,
  service_allowance_min: z.number().nonnegative(),
});
export type ServiceAllowance = z.infer<typeof ServiceAllowanceSchema>;
