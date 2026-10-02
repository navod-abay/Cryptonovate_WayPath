import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addOperatingDays,
  businessInstant,
  colomboMinutesSinceMidnight,
  colomboToday,
  createCalendar,
  isOperatingDay,
  isValidIsoDate,
  nextOperatingDay,
  now,
  operatingDaysBetween,
  prevOperatingDay,
  runWithClock,
} from '../../src/domain/calendar.js';

test('Sunday is not an operating day; Monday–Saturday are', () => {
  assert.equal(isOperatingDay('2026-09-27'), false);
  for (const d of ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03']) {
    assert.equal(isOperatingDay(d), true, d);
  }
});

test('nextOperatingDay skips Sunday across a Saturday', () => {
  assert.equal(nextOperatingDay('2026-10-02'), '2026-10-03');
  assert.equal(nextOperatingDay('2026-10-03'), '2026-10-05');
  assert.equal(nextOperatingDay('2026-10-04'), '2026-10-05');
});

test('prevOperatingDay and addOperatingDays skip Sunday both ways', () => {
  assert.equal(prevOperatingDay('2026-10-05'), '2026-10-03');
  assert.equal(addOperatingDays('2026-10-02', 2), '2026-10-05');
  assert.equal(addOperatingDays('2026-10-05', -2), '2026-10-02');
  assert.equal(addOperatingDays('2026-10-05', 0), '2026-10-05');
});

test('operatingDaysBetween counts operating days in (from, to]', () => {
  assert.equal(operatingDaysBetween('2026-10-02', '2026-10-05'), 2);
  assert.equal(operatingDaysBetween('2026-10-05', '2026-10-05'), 0);
  assert.equal(operatingDaysBetween('2026-10-05', '2026-10-01'), 0);
});

test('holiday list is honoured and skipped', () => {
  const cal = createCalendar({ timeZone: 'Asia/Colombo', nonOperatingWeekdays: [0], holidays: ['2026-10-05'] });
  assert.equal(cal.isOperatingDay('2026-10-05'), false);
  assert.equal(cal.nextOperatingDay('2026-10-03'), '2026-10-06');
  assert.equal(cal.prevOperatingDay('2026-10-06'), '2026-10-03');
});

test('a calendar with no operating days fails loudly instead of looping', () => {
  const cal = createCalendar({ timeZone: 'Asia/Colombo', nonOperatingWeekdays: [0, 1, 2, 3, 4, 5, 6], holidays: [] });
  assert.throws(() => cal.nextOperatingDay('2026-10-03'), /No operating day/);
});

test('business day is evaluated in Asia/Colombo, not UTC', () => {
  const at = new Date('2026-10-02T20:00:00Z'); // 01:30 on the 3rd in Colombo
  assert.equal(colomboToday(at), '2026-10-03');
  assert.equal(colomboMinutesSinceMidnight(at), 90);
  assert.equal(colomboMinutesSinceMidnight(new Date('2026-10-02T10:30:00Z')), 16 * 60);
});

test('businessInstant converts Colombo wall-clock to the right instant', () => {
  assert.equal(businessInstant('2026-10-03', '16:00').toISOString(), '2026-10-03T10:30:00.000Z');
  assert.equal(businessInstant('2026-10-03', '04:30').toISOString(), '2026-10-02T23:00:00.000Z');
});

test('runWithClock freezes now() for the callback only', () => {
  const frozen = new Date('2030-01-01T00:00:00Z');
  runWithClock(frozen, () => assert.equal(now().getTime(), frozen.getTime()));
  assert.notEqual(now().getTime(), frozen.getTime());
});

test('isValidIsoDate rejects impossible dates', () => {
  assert.equal(isValidIsoDate('2026-02-29'), false);
  assert.equal(isValidIsoDate('2028-02-29'), true);
  assert.equal(isValidIsoDate('2026-9-1'), false);
  assert.equal(isValidIsoDate('not-a-date'), false);
});
