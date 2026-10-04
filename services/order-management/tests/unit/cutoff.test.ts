import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cutoffInstant, earliestDeliveryDate, isDateOpen, isPastCutoff, resolveConfirmDate } from '../../src/domain/cutoff.js';
import { AppError } from '../../src/domain/errors.js';

const colombo = (isoLocal: string) => new Date(`${isoLocal}+05:30`);

// 2026-09-28 is a Monday.
const TABLE = [
  { label: 'Mon 15:59:59', at: '2026-09-28T15:59:59', accept: false, expected: '2026-09-29', rolled: false },
  { label: 'Mon 16:00:00 + accept_next_run', at: '2026-09-28T16:00:00', accept: true, expected: '2026-09-30', rolled: true },
  { label: 'Fri 15:00', at: '2026-10-02T15:00:00', accept: false, expected: '2026-10-03', rolled: false },
  { label: 'Fri 17:00 + accept_next_run', at: '2026-10-02T17:00:00', accept: true, expected: '2026-10-05', rolled: true },
  { label: 'Sat 15:00', at: '2026-10-03T15:00:00', accept: false, expected: '2026-10-05', rolled: false },
  { label: 'Sat 17:00 + accept_next_run', at: '2026-10-03T17:00:00', accept: true, expected: '2026-10-06', rolled: true },
  // Sunday has no run: Monday closed at Saturday's cutoff, so all of Sunday orders for Tuesday.
  { label: 'Sun 10:00 + accept_next_run', at: '2026-10-04T10:00:00', accept: true, expected: '2026-10-06', rolled: true },
  { label: 'Sun 17:00 + accept_next_run', at: '2026-10-04T17:00:00', accept: true, expected: '2026-10-06', rolled: true },
];

for (const row of TABLE) {
  test(`§5.3 cutoff table: ${row.label} -> ${row.expected}`, () => {
    const r = resolveConfirmDate({ requestedDate: null, acceptNextRun: row.accept, at: colombo(row.at) });
    assert.equal(r.orderDate, row.expected);
    assert.equal(r.rolledToNextRun, row.rolled);
  });
}

test('at/after cutoff without accept_next_run -> CUTOFF_PASSED with next_available_date', () => {
  const cases: [string, string][] = [
    ['2026-09-28T16:00:00', '2026-09-30'],
    ['2026-10-02T17:00:00', '2026-10-05'],
    ['2026-10-03T17:00:00', '2026-10-06'],
  ];
  for (const [at, next] of cases) {
    assert.throws(
      () => resolveConfirmDate({ requestedDate: null, acceptNextRun: false, at: colombo(at) }),
      (err: unknown) =>
        err instanceof AppError &&
        err.code === 'CUTOFF_PASSED' &&
        err.httpStatus === 409 &&
        (err.details as { next_available_date: string }).next_available_date === next,
    );
  }
});

test('15:59:59 is before cutoff, 16:00:00 is at cutoff', () => {
  assert.equal(isPastCutoff(colombo('2026-09-28T15:59:59')), false);
  assert.equal(isPastCutoff(colombo('2026-09-28T16:00:00')), true);
});

test('accept_next_run before cutoff does not roll', () => {
  const r = resolveConfirmDate({ requestedDate: null, acceptNextRun: true, at: colombo('2026-09-28T10:00:00') });
  assert.deepEqual(r, { orderDate: '2026-09-29', rolledToNextRun: false });
});

test('an explicit future date is honoured while still open', () => {
  const r = resolveConfirmDate({ requestedDate: '2026-10-01', acceptNextRun: false, at: colombo('2026-09-28T17:00:00') });
  assert.deepEqual(r, { orderDate: '2026-10-01', rolledToNextRun: false });
});

test('an explicit date whose cutoff has passed is rejected, or rolled with consent', () => {
  const at = colombo('2026-09-28T17:00:00');
  assert.throws(() => resolveConfirmDate({ requestedDate: '2026-09-29', acceptNextRun: false, at }), /cutoff/);
  assert.deepEqual(resolveConfirmDate({ requestedDate: '2026-09-29', acceptNextRun: true, at }), {
    orderDate: '2026-09-30',
    rolledToNextRun: true,
  });
});

test('earliestDeliveryDate and isDateOpen agree', () => {
  const at = colombo('2026-10-03T16:30:00');
  assert.equal(earliestDeliveryDate(at), '2026-10-06');
  assert.equal(isDateOpen('2026-10-05', at), false);
  assert.equal(isDateOpen('2026-10-06', at), true);
});

test('cutoffInstant is the cutoff hour on the previous operating day, skipping Sundays', () => {
  // Tue 2026-09-29 closes Mon 16:00; Mon 2026-10-05 closes Sat 2026-10-03 16:00 (Sunday has no run).
  assert.equal(cutoffInstant('2026-09-29').toISOString(), colombo('2026-09-28T16:00:00').toISOString());
  assert.equal(cutoffInstant('2026-10-05').toISOString(), colombo('2026-10-03T16:00:00').toISOString());
});

test('Monday stays closed all Sunday, before and after the cutoff hour', () => {
  for (const at of ['2026-10-04T00:00:00', '2026-10-04T10:00:00', '2026-10-04T15:59:59', '2026-10-04T16:00:00']) {
    assert.equal(isDateOpen('2026-10-05', colombo(at)), false, at);
    assert.equal(earliestDeliveryDate(colombo(at)), '2026-10-06', at);
  }
  assert.throws(
    () => resolveConfirmDate({ requestedDate: '2026-10-05', acceptNextRun: false, at: colombo('2026-10-04T10:00:00') }),
    (err: unknown) => err instanceof AppError && err.code === 'CUTOFF_PASSED',
  );
});
