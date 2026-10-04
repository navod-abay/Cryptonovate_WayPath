import { apiGet, apiPatch } from './clientApi';
import { Vehicle } from '../components/VehicleCard';

function mapApiVehicle(apiVehicle: Record<string, unknown>): Vehicle {
  return {
    id: apiVehicle.vehicle_id as string,
    arrivalTime: '04:00 AM',
    stops: 0,
    temperature: apiVehicle.temp === 'reefer' ? 'frozen' : 'ambient',
    vehicleType: apiVehicle.type as 'truck' | 'van',
  };
}

export interface Outlet {
  outlet_id: string;
  brand: string;
  district: string;
  depot: string;
  dock_type: string;
  parking_constraint: string;
  mall_window: boolean;
  window_open_time: string;
  window_close_time: string;
}

export async function getVehicles(depot?: string): Promise<Vehicle[]> {
  const query = depot ? `?depot=${encodeURIComponent(depot)}` : '';
  const data = await apiGet<Record<string, unknown>[]>(`/api/fleet/vehicles${query}`);
  return data.map(mapApiVehicle);
}

export async function getVehicle(vehicleId: string): Promise<Vehicle> {
  return apiGet<Vehicle>(`/api/fleet/vehicles/${vehicleId}`);
}

export async function updateVehicleStatus(
  vehicleId: string,
  status: 'available' | 'in_workshop'
): Promise<Vehicle> {
  return apiPatch<Vehicle>(`/api/fleet/vehicles/${vehicleId}/status`, { status });
}

export async function getOutletsByIds(outletIds: string[]): Promise<Outlet[]> {
  return apiPost<Outlet[]>('/api/fleet/outlets/batch', { outlet_ids: outletIds });
}
