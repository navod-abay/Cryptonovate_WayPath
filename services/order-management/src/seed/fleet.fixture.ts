import type { Depot } from '../schemas/orders.schema.js';

export interface VehicleFixture {
  vehicle_id: string;
  type: 'truck' | 'van';
  temp: 'reefer' | 'ambient';
  weight_cap_kg: number;
  volume_cap_m3: number;
  depot: Depot;
}

type Row = [string, 'truck' | 'van', 'reefer' | 'ambient', number, number, Depot];

/**
 * Snapshot of data/vehicles.csv (60 vehicles, 16 refrigerated). Used for demo seeding and as the
 * fallback capacity reference when Fleet & Directory's `vehicles` table is not present.
 */
// prettier-ignore
const ROWS: readonly Row[] = [
  ['VEH001', 'truck', 'reefer', 5510, 26.4, 'Peliyagoda'],
  ['VEH002', 'truck', 'reefer', 3990, 21.1, 'Peliyagoda'],
  ['VEH003', 'truck', 'reefer', 5510, 26.4, 'Peliyagoda'],
  ['VEH004', 'truck', 'reefer', 6840, 33.4, 'Peliyagoda'],
  ['VEH005', 'truck', 'reefer', 6840, 33.4, 'Peliyagoda'],
  ['VEH006', 'truck', 'reefer', 6840, 33.4, 'Peliyagoda'],
  ['VEH007', 'truck', 'reefer', 3610, 19.4, 'Peliyagoda'],
  ['VEH008', 'truck', 'ambient', 3800, 22.0, 'Peliyagoda'],
  ['VEH009', 'truck', 'ambient', 5800, 30.0, 'Peliyagoda'],
  ['VEH010', 'truck', 'ambient', 6500, 34.0, 'Peliyagoda'],
  ['VEH011', 'truck', 'ambient', 7200, 38.0, 'Peliyagoda'],
  ['VEH012', 'truck', 'ambient', 4200, 24.0, 'Peliyagoda'],
  ['VEH013', 'truck', 'ambient', 5800, 30.0, 'Peliyagoda'],
  ['VEH014', 'truck', 'ambient', 7200, 38.0, 'Peliyagoda'],
  ['VEH015', 'truck', 'ambient', 3800, 22.0, 'Peliyagoda'],
  ['VEH016', 'truck', 'ambient', 3800, 22.0, 'Peliyagoda'],
  ['VEH017', 'truck', 'ambient', 3800, 22.0, 'Peliyagoda'],
  ['VEH018', 'truck', 'ambient', 3800, 22.0, 'Peliyagoda'],
  ['VEH019', 'truck', 'ambient', 7200, 38.0, 'Peliyagoda'],
  ['VEH020', 'truck', 'ambient', 6500, 34.0, 'Peliyagoda'],
  ['VEH021', 'truck', 'ambient', 4200, 24.0, 'Peliyagoda'],
  ['VEH022', 'truck', 'ambient', 4200, 24.0, 'Peliyagoda'],
  ['VEH023', 'truck', 'ambient', 7200, 38.0, 'Peliyagoda'],
  ['VEH024', 'truck', 'ambient', 6500, 34.0, 'Peliyagoda'],
  ['VEH025', 'truck', 'ambient', 3800, 22.0, 'Peliyagoda'],
  ['VEH026', 'truck', 'ambient', 7200, 38.0, 'Peliyagoda'],
  ['VEH027', 'truck', 'ambient', 3800, 22.0, 'Peliyagoda'],
  ['VEH028', 'truck', 'ambient', 4200, 24.0, 'Peliyagoda'],
  ['VEH029', 'truck', 'ambient', 5800, 30.0, 'Peliyagoda'],
  ['VEH030', 'truck', 'ambient', 6500, 34.0, 'Peliyagoda'],
  ['VEH031', 'truck', 'ambient', 7200, 38.0, 'Peliyagoda'],
  ['VEH032', 'truck', 'ambient', 4200, 24.0, 'Peliyagoda'],
  ['VEH033', 'truck', 'ambient', 7200, 38.0, 'Peliyagoda'],
  ['VEH034', 'truck', 'ambient', 3800, 22.0, 'Peliyagoda'],
  ['VEH035', 'van', 'reefer', 1040, 7.0, 'Peliyagoda'],
  ['VEH036', 'van', 'reefer', 1040, 7.0, 'Peliyagoda'],
  ['VEH037', 'van', 'ambient', 1100, 8.0, 'Peliyagoda'],
  ['VEH038', 'van', 'ambient', 1200, 9.0, 'Peliyagoda'],
  ['VEH039', 'truck', 'reefer', 6180, 29.9, 'Kandy'],
  ['VEH040', 'truck', 'reefer', 5510, 26.4, 'Kandy'],
  ['VEH041', 'truck', 'reefer', 3610, 19.4, 'Kandy'],
  ['VEH042', 'truck', 'reefer', 6180, 29.9, 'Kandy'],
  ['VEH043', 'truck', 'reefer', 5510, 26.4, 'Kandy'],
  ['VEH044', 'truck', 'ambient', 4200, 24.0, 'Kandy'],
  ['VEH045', 'truck', 'ambient', 4200, 24.0, 'Kandy'],
  ['VEH046', 'truck', 'ambient', 3800, 22.0, 'Kandy'],
  ['VEH047', 'truck', 'ambient', 5800, 30.0, 'Kandy'],
  ['VEH048', 'truck', 'ambient', 4200, 24.0, 'Kandy'],
  ['VEH049', 'truck', 'ambient', 4200, 24.0, 'Kandy'],
  ['VEH050', 'truck', 'ambient', 6500, 34.0, 'Kandy'],
  ['VEH051', 'truck', 'ambient', 7200, 38.0, 'Kandy'],
  ['VEH052', 'truck', 'ambient', 4200, 24.0, 'Kandy'],
  ['VEH053', 'truck', 'ambient', 6500, 34.0, 'Kandy'],
  ['VEH054', 'truck', 'ambient', 7200, 38.0, 'Kandy'],
  ['VEH055', 'truck', 'ambient', 4200, 24.0, 'Kandy'],
  ['VEH056', 'truck', 'ambient', 3800, 22.0, 'Kandy'],
  ['VEH057', 'van', 'reefer', 1040, 7.0, 'Kandy'],
  ['VEH058', 'van', 'reefer', 1040, 7.0, 'Kandy'],
  ['VEH059', 'van', 'ambient', 1200, 9.0, 'Kandy'],
  ['VEH060', 'van', 'ambient', 1200, 9.0, 'Kandy'],
];

export const VEHICLE_FIXTURE: readonly VehicleFixture[] = ROWS.map(([vehicle_id, type, temp, weight_cap_kg, volume_cap_m3, depot]) => ({
  vehicle_id,
  type,
  temp,
  weight_cap_kg,
  volume_cap_m3,
  depot,
}));
