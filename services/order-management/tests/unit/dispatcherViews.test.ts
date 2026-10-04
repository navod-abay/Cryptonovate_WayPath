import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runWithClock } from '../../src/domain/calendar.js';
import { categoryOf, getOrderWindows } from '../../src/services/orders.service.js';

const colombo = (isoLocal: string) => new Date(`${isoLocal}+05:30`);

test('dashboard categories split Fresh by temperature', () => {
  assert.equal(categoryOf('Fresh', 'chilled'), 'chilled');
  assert.equal(categoryOf('Fresh', 'ambient'), 'dry');
  assert.equal(categoryOf('Tech', 'ambient'), 'tech');
  assert.equal(categoryOf('Style', 'ambient'), 'style');
});

test('order windows skip Sundays and report open until the previous operating day cutoff', () => {
  // Saturday 2026-10-03 15:00: Monday's window (closes Sat 16:00) is still open.
  const before = runWithClock(colombo('2026-10-03T15:00:00'), () => getOrderWindows('2026-10-03', '2026-10-06'));
  assert.equal(before.serverTime, colombo('2026-10-03T15:00:00').toISOString());
  assert.equal(before.timeZone, 'Asia/Colombo');
  assert.deepEqual(
    before.days.map((d) => [d.date, d.open]),
    [['2026-10-03', false], ['2026-10-05', true], ['2026-10-06', true]],
  );
  assert.equal(before.days[1].cutoffAt, colombo('2026-10-03T16:00:00').toISOString());

  const after = runWithClock(colombo('2026-10-03T16:00:00'), () => getOrderWindows('2026-10-05', '2026-10-05'));
  assert.equal(after.days[0].open, false);
});
