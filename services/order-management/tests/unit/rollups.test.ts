import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRollups } from '../../src/domain/rollups.js';

test('1.03 kg x 120 = 123.60 exactly, not 123.59999', () => {
  const r = computeRollups([{ quantity: 120, unit_weight_kg: 1.03, unit_volume_m3: 0.0011 }]);
  assert.equal(r.order_weight_kg, 123.6);
  assert.equal(r.order_volume_m3, 0.132);
  assert.equal(r.order_units, 120);
});

test('sums across lines with column-scale rounding', () => {
  const r = computeRollups([
    { quantity: 120, unit_weight_kg: 1.03, unit_volume_m3: 0.0011 },
    { quantity: 3, unit_weight_kg: 0.1, unit_volume_m3: 0.0001 },
    { quantity: 7, unit_weight_kg: 12.345, unit_volume_m3: 0.0456 },
  ]);
  assert.equal(r.order_units, 130);
  assert.equal(r.order_weight_kg, 210.32); // 123.6 + 0.3 + 86.415 = 210.315
  assert.equal(r.order_volume_m3, 0.452); // 0.132 + 0.0003 + 0.3192 = 0.4515
});

test('empty basket rolls up to zero', () => {
  assert.deepEqual(computeRollups([]), { order_units: 0, order_weight_kg: 0, order_volume_m3: 0 });
});
