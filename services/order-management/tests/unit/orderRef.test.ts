import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatOrderRef, isOrderRef } from '../../src/domain/orderRef.js';

test('format is ORD-YYYYMMDD-NNNNN with zero padding', () => {
  assert.equal(formatOrderRef('2026-09-29', 42), 'ORD-20260929-00042');
  assert.equal(formatOrderRef('2026-09-29', 1), 'ORD-20260929-00001');
});

test('sequence beyond 5 digits widens instead of truncating', () => {
  assert.equal(formatOrderRef('2026-09-29', 123456), 'ORD-20260929-123456');
  assert.equal(isOrderRef('ORD-20260929-123456'), true);
});

test('rejects non-positive or fractional sequence values', () => {
  assert.throws(() => formatOrderRef('2026-09-29', 0), RangeError);
  assert.throws(() => formatOrderRef('2026-09-29', 1.5), RangeError);
});

test('isOrderRef recognises valid refs only', () => {
  assert.equal(isOrderRef('ORD-20260929-00042'), true);
  assert.equal(isOrderRef('confirmed'), false);
  assert.equal(isOrderRef('ORD-2026929-00042'), false);
});
