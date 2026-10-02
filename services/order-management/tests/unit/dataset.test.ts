import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOperatingDay, nextOperatingDay } from '../../src/domain/calendar.js';
import { DATASET_HOLIDAYS } from '../../src/domain/holidays.js';
import { reeferCapacityFromFixture } from '../../src/repositories/fleet.repo.js';
import { VEHICLE_FIXTURE } from '../../src/seed/fleet.fixture.js';
import { buildOutletFixture } from '../../src/seed/outlets.fixture.js';

test('outlet snapshot matches the dataset: 120 outlets, 80 Fresh / 25 Style / 15 Tech', () => {
  const outlets = buildOutletFixture();
  assert.equal(outlets.length, 120);
  assert.equal(new Set(outlets.map((o) => o.outlet_id)).size, 120);
  const count = (brand: string) => outlets.filter((o) => o.brand === brand).length;
  assert.deepEqual([count('Fresh'), count('Style'), count('Tech')], [80, 25, 15]);
  assert.equal(outlets.filter((o) => o.depot === 'Peliyagoda').length, 75);
});

test('OUT001 is the Fresh / Peliyagoda outlet the seeded store manager is bound to', () => {
  const out001 = buildOutletFixture().find((o) => o.outlet_id === 'OUT001');
  assert.deepEqual(out001, {
    outlet_id: 'OUT001',
    brand: 'Fresh',
    district: 'Colombo',
    depot: 'Peliyagoda',
    dock_type: 'street',
    parking_constraint: 'van_only',
    mall_window: false,
    window_open_time: '05:00',
    window_close_time: '07:30',
  });
});

test('every outlet satisfies the outlets_ref constraints', () => {
  for (const o of buildOutletFixture()) {
    assert.match(o.window_open_time, /^\d{2}:\d{2}$/);
    assert.ok(o.window_close_time > o.window_open_time, `${o.outlet_id} window`);
    assert.equal(o.mall_window, o.dock_type === 'mall_bay', `${o.outlet_id} mall flag`);
    assert.equal(o.parking_constraint === 'mall_dock', o.dock_type === 'mall_bay', `${o.outlet_id} mall dock`);
  }
});

test('fleet snapshot: 60 vehicles, 16 refrigerated, 9 of them at Peliyagoda', () => {
  assert.equal(VEHICLE_FIXTURE.length, 60);
  assert.deepEqual(reeferCapacityFromFixture(), { vehicles: 16, volume_m3: 353.5, source: 'dataset-snapshot' });
  assert.deepEqual(reeferCapacityFromFixture('Peliyagoda'), { vehicles: 9, volume_m3: 207.5, source: 'dataset-snapshot' });
  assert.deepEqual(reeferCapacityFromFixture('Kandy'), { vehicles: 7, volume_m3: 146, source: 'dataset-snapshot' });
});

test('dataset holidays are non-operating and are skipped', () => {
  for (const d of DATASET_HOLIDAYS) assert.equal(isOperatingDay(d), false, d);
  // Sat 2026-04-11 -> Sun, then New Year Mon 13th and Tue 14th are closed -> Wed 15th
  assert.equal(nextOperatingDay('2026-04-11'), '2026-04-15');
  assert.equal(isOperatingDay('2026-04-15'), true);
});
