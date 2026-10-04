import { Vehicle } from '../components/VehicleCard';

export interface LoadingItem {
  id: string;
  name: string;
  loaded: number;
  total: number;
  damaged: number;
}

export const demoVehicles: Vehicle[] = [
  { id: 'VEH006', arrivalTime: '04:00 AM', stops: 5, temperature: 'frozen', vehicleType: 'truck' },
  { id: 'VEH015', arrivalTime: '04:00 AM', stops: 3, temperature: 'chilled', vehicleType: 'truck' },
  { id: 'VEH056', arrivalTime: '04:30 AM', stops: 7, temperature: 'ambient', vehicleType: 'van' },
  { id: 'VEH023', arrivalTime: '04:45 AM', stops: 4, temperature: 'frozen', vehicleType: 'truck' },
  { id: 'VEH089', arrivalTime: '05:00 AM', stops: 6, temperature: 'ambient', vehicleType: 'van' },
];

export const loadingVehicles: Vehicle[] = [
  { id: 'VEH042', arrivalTime: '04:00 AM', stops: 5, temperature: 'frozen', vehicleType: 'truck' },
];

export const completedVehicles: Vehicle[] = [
  { id: 'VEH035', arrivalTime: '03:00 AM', stops: 5, temperature: 'frozen', vehicleType: 'truck' },
  { id: 'VEH036', arrivalTime: '04:00 AM', stops: 5, temperature: 'ambient', vehicleType: 'van' },
];

export const loadingItems: LoadingItem[] = [
  { id: '1', name: 'Diary Crates', loaded: 1, total: 6, damaged: 0 },
  { id: '2', name: 'Fresh Milk Crates', loaded: 0, total: 5, damaged: 0 },
  { id: '3', name: 'Yoghurt Crates', loaded: 4, total: 4, damaged: 0 },
  { id: '4', name: 'Chicken Tray', loaded: 8, total: 8, damaged: 0 },
  { id: '5', name: 'Veg Crates', loaded: 0, total: 3, damaged: 0 },
];

export const outlets: string[] = ['OUT001', 'OUT002', 'OUT003', 'OUT012'];
