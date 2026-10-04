import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapFleetVehicle } from '../../src/clients/fleet.client.js';
import { reeferCapacityOf } from '../../src/services/referenceData.js';

// Shape exactly as Fleet & Directory returns it.
const FLEET_VEHICLE = {
  vehicle_id: 'VEH001',
  type: 'truck',
  temp: 'reefer',
  weight_cap_kg: 5510,
  volume_cap_m3: 26.4,
  fuel_type: 'diesel',
  km_per_l: 4.7,
  weekly_fuel_quota_l: 340,
  depot: 'Peliyagoda',
  status: 'available',
};

test('a Fleet vehicle maps with its status; a missing status counts as available', () => {
  assert.deepEqual(mapFleetVehicle(FLEET_VEHICLE), {
    vehicle_id: 'VEH001',
    type: 'truck',
    temp: 'reefer',
    weight_cap_kg: 5510,
    volume_cap_m3: 26.4,
    depot: 'Peliyagoda',
    status: 'available',
  });
  assert.equal(mapFleetVehicle({ ...FLEET_VEHICLE, status: null })?.status, 'available');
});

test('vehicle rows that break the contract are rejected, not used', () => {
  assert.equal(mapFleetVehicle({ ...FLEET_VEHICLE, volume_cap_m3: '26.4' }), null);
  assert.equal(mapFleetVehicle({ ...FLEET_VEHICLE, temp: 'frozen' }), null);
  assert.equal(mapFleetVehicle({ ...FLEET_VEHICLE, depot: 'Galle' }), null);
  assert.equal(mapFleetVehicle(null), null);
});

test('reefer capacity counts only refrigerated vehicles, optionally for one depot', () => {
  const vehicles = [
    mapFleetVehicle(FLEET_VEHICLE)!,
    mapFleetVehicle({ ...FLEET_VEHICLE, vehicle_id: 'VEH002', volume_cap_m3: 21.1 })!,
    mapFleetVehicle({ ...FLEET_VEHICLE, vehicle_id: 'VEH039', depot: 'Kandy', volume_cap_m3: 18 })!,
    mapFleetVehicle({ ...FLEET_VEHICLE, vehicle_id: 'VEH010', temp: 'ambient', volume_cap_m3: 30 })!,
  ];
  assert.deepEqual(reeferCapacityOf(vehicles), { vehicles: 3, volume_m3: 65.5 });
  assert.deepEqual(reeferCapacityOf(vehicles, 'Peliyagoda'), { vehicles: 2, volume_m3: 47.5 });
  assert.deepEqual(reeferCapacityOf([], 'Kandy'), { vehicles: 0, volume_m3: 0 });
});
