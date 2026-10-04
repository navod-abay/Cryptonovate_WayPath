import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../../src/domain/errors.js';
import { assertTransition, ORDER_STATUSES, TERMINAL_STATUSES, TRANSITIONS, type OrderStatus } from '../../src/domain/statusMachine.js';

const ALLOWED: [OrderStatus, OrderStatus][] = [
  ['draft', 'confirmed'],
  ['draft', 'cancelled'],
  ['confirmed', 'allocated'],
  ['confirmed', 'deferred'],
  ['confirmed', 'cancelled'],
  ['allocated', 'loaded'],
  ['loaded', 'out_for_delivery'],
  ['out_for_delivery', 'delivered'],
  ['delivered', 'received'],
  ['delivered', 'disputed'],
  ['deferred', 'confirmed'],
  ['deferred', 'not_run'],
];

test('every allowed transition passes', () => {
  for (const [from, to] of ALLOWED) assert.doesNotThrow(() => assertTransition(from, to), `${from} -> ${to}`);
});

test('the adjacency map contains exactly the documented transitions', () => {
  const actual = ORDER_STATUSES.flatMap((from) => TRANSITIONS[from].map((to) => `${from}->${to}`)).sort();
  assert.deepEqual(actual, ALLOWED.map(([f, t]) => `${f}->${t}`).sort());
});

test('illegal transitions throw INVALID_STATE_TRANSITION listing what was allowed', () => {
  const illegal: [OrderStatus, OrderStatus][] = [
    ['delivered', 'confirmed'],
    ['draft', 'deferred'],
    ['allocated', 'deferred'],
    ['allocated', 'cancelled'],
    ['received', 'disputed'],
    ['cancelled', 'confirmed'],
    ['not_run', 'confirmed'],
    ['draft', 'allocated'],
    ['confirmed', 'confirmed'],
  ];
  for (const [from, to] of illegal) {
    assert.throws(
      () => assertTransition(from, to),
      (err: unknown) =>
        err instanceof AppError &&
        err.code === 'INVALID_STATE_TRANSITION' &&
        err.httpStatus === 409 &&
        JSON.stringify((err.details as { allowed: string[] }).allowed) === JSON.stringify(TRANSITIONS[from]),
      `${from} -> ${to}`,
    );
  }
});

test('received, disputed, not_run and cancelled are terminal', () => {
  assert.deepEqual([...TERMINAL_STATUSES].sort(), ['cancelled', 'disputed', 'not_run', 'received']);
});
