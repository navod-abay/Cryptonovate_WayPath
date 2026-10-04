import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../../src/domain/errors.js';
import { assertDeferralReason, DEFERRAL_REASON_CODES } from '../../src/domain/reasonCodes.js';

const rejects = (code: unknown, note?: unknown) =>
  assert.throws(
    () => assertDeferralReason(code, note),
    (err: unknown) => err instanceof AppError && err.code === 'DEFERRAL_REASON_REQUIRED' && err.httpStatus === 422,
  );

test('exactly the eleven documented reason codes', () => {
  assert.equal(DEFERRAL_REASON_CODES.length, 11);
});

test('missing or unknown reason_code is rejected', () => {
  rejects(undefined);
  rejects('');
  rejects('BECAUSE');
});

test('AGED_OUT is system-only', () => rejects('AGED_OUT'));

test('DISPATCHER_OVERRIDE requires a non-empty note', () => {
  rejects('DISPATCHER_OVERRIDE');
  rejects('DISPATCHER_OVERRIDE', '   ');
  assert.deepEqual(assertDeferralReason('DISPATCHER_OVERRIDE', ' outlet closed '), {
    reasonCode: 'DISPATCHER_OVERRIDE',
    reasonNote: 'outlet closed',
  });
});

test('ordinary codes do not need a note', () => {
  assert.deepEqual(assertDeferralReason('NO_REEFER_AVAILABLE', undefined), {
    reasonCode: 'NO_REEFER_AVAILABLE',
    reasonNote: null,
  });
});
