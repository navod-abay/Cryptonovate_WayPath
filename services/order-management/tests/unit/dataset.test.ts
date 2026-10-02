import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOperatingDay, nextOperatingDay } from '../../src/domain/calendar.js';
import { DATASET_HOLIDAYS } from '../../src/domain/holidays.js';

test('dataset holidays are non-operating and are skipped', () => {
  for (const d of DATASET_HOLIDAYS) assert.equal(isOperatingDay(d), false, d);
  // Sat 2026-04-11 -> Sun, then New Year Mon 13th and Tue 14th are closed -> Wed 15th
  assert.equal(nextOperatingDay('2026-04-11'), '2026-04-15');
  assert.equal(isOperatingDay('2026-04-15'), true);
});
