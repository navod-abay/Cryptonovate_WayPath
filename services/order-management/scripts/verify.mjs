#!/usr/bin/env node
/**
 * Order Management endpoint scenario suite (§12.2).
 *
 *   npm run verify
 *
 * Runs against a LIVE stack. Targets are never assumed; they come from the environment or
 * from a git-ignored .env.verify next to package.json (template: .env.verify.example):
 *   BASE_URL   required — Order Management base including /api/orders
 *   AUTH_URL   required unless AUTH_MODE=mint — auth-rbac base including /api/auth
 *   AUTH_MODE  login (default) | mint — `mint` signs dev tokens locally with JWT_ACCESS_SECRET
 *              (required in that mode) for when auth-rbac is down; scenario 2 then reports SKIP.
 *   VERIFY_WEEK_OFFSET  optional integer to pin the synthetic test week.
 *
 * Every write lands on a synthetic far-future week (unique per run), so runs never collide
 * with seed data or with each other. Time-dependent scenarios freeze the service clock with
 * the X-Test-Now header (honoured only when NODE_ENV !== 'production').
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const envFile = fileURLToPath(new URL('../.env.verify', import.meta.url));
if (existsSync(envFile)) dotenv.config({ path: envFile });

const AUTH_MODE = process.env.AUTH_MODE || 'login';
const missing = [
  !process.env.BASE_URL && 'BASE_URL',
  AUTH_MODE !== 'mint' && !process.env.AUTH_URL && 'AUTH_URL',
  AUTH_MODE === 'mint' && !process.env.JWT_ACCESS_SECRET && 'JWT_ACCESS_SECRET',
].filter(Boolean);
if (missing.length > 0) {
  console.error(
    `verify: missing ${missing.join(', ')}.\n` +
      'Set them in the environment, or copy .env.verify.example to .env.verify and fill it in.',
  );
  process.exit(2);
}

const BASE_URL = process.env.BASE_URL.replace(/\/$/, '');
const AUTH_URL = (process.env.AUTH_URL ?? '').replace(/\/$/, '');
const MAX_DEFERRALS = Number(process.env.MAX_DEFERRALS ?? 3);

// ------------------------------------------------------------------ dates

const addDays = (date, n) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();
const nextOperatingDay = (date) => {
  let d = addDays(date, 1);
  while (weekday(d) === 0) d = addDays(d, 1);
  return d;
};
const colomboToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

function syntheticMonday() {
  let first = '2040-01-01';
  while (weekday(first) !== 1) first = addDays(first, 1);
  const offset = process.env.VERIFY_WEEK_OFFSET
    ? Number(process.env.VERIFY_WEEK_OFFSET)
    : Math.floor(Date.now() / 1000) % 50_000;
  return addDays(first, 7 * offset);
}

const MON = syntheticMonday();
const TUE = addDays(MON, 1);
const WED = addDays(MON, 2);
const THU = addDays(MON, 3);
const FRI = addDays(MON, 4);
const SAT = addDays(MON, 5);
const SUN = addDays(MON, 6);
const NEXT_MON = addDays(MON, 7);
const NEXT_TUE = addDays(MON, 8);
const at = (date, time) => `${date}T${time.length === 5 ? `${time}:00` : time}+05:30`;
const PRE_CUTOFF = at(MON, '10:00');

// ------------------------------------------------------------------ http

async function call(method, path, { token, body, headers = {}, rawBody, now } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (now) h['X-Test-Now'] = now;
  let payload;
  if (rawBody !== undefined) {
    h['Content-Type'] = 'application/json';
    payload = rawBody;
  } else if (body !== undefined) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE_URL}${path}`, { method, headers: h, body: payload });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, body: json };
}

// ------------------------------------------------------------------ assertions

class Skip extends Error {}

function check(cond, message) {
  if (!cond) throw new Error(message);
}

function expectStatus(res, status, code) {
  const got = `${res.status}${res.body?.error?.code ? ` ${res.body.error.code}` : ''}`;
  check(res.status === status, `expected HTTP ${status}${code ? ` ${code}` : ''}, got ${got}: ${JSON.stringify(res.body)?.slice(0, 300)}`);
  if (code) check(res.body?.error?.code === code, `expected error.code ${code}, got ${res.body?.error?.code}`);
  return res.body?.data;
}

const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ------------------------------------------------------------------ runner

const results = [];

async function scenario(id, title, fn) {
  const label = `${String(id).padStart(2, ' ')}. ${title}`;
  try {
    await fn();
    results.push({ id, status: 'PASS' });
    console.log(`PASS  ${label}`);
  } catch (err) {
    if (err instanceof Skip) {
      results.push({ id, status: 'SKIP' });
      console.log(`SKIP  ${label} — ${err.message}`);
    } else {
      results.push({ id, status: 'FAIL' });
      console.log(`FAIL  ${label}\n      ${err.message}`);
    }
  }
}

// ------------------------------------------------------------------ fixtures

const AMBIENT_ITEMS = [
  { sku: 'RICE-5KG', description: 'Samba rice 5kg bag', quantity: 10, unit_weight_kg: 5.05, unit_volume_m3: 0.007 },
  { sku: 'TEA-400G', description: 'Ceylon tea 400g', quantity: 20, unit_weight_kg: 0.42, unit_volume_m3: 0.0009 },
  { sku: 'BISC-CTN', description: 'Biscuit carton (24 packs)', quantity: 4, unit_weight_kg: 4.8, unit_volume_m3: 0.028 },
];
// Hand-computed: 10+20+4 = 34 units; 50.5 + 8.4 + 19.2 = 78.10 kg; 0.070 + 0.018 + 0.112 = 0.200 m3
const AMBIENT_TOTALS = { units: 34, weight: 78.1, volume: 0.2 };
const CHILLED_ITEMS = [
  { sku: 'MLK-1L', description: 'Fresh milk 1L', quantity: 120, unit_weight_kg: 1.03, unit_volume_m3: 0.0011, is_chilled: true },
];

const tokens = {};

async function mintTokens() {
  let jwt;
  try {
    jwt = (await import('jsonwebtoken')).default;
  } catch {
    throw new Error('AUTH_MODE=mint needs jsonwebtoken — run from services/order-management after npm install');
  }
  const secret = process.env.JWT_ACCESS_SECRET;
  const mk = (username, role, outlet_id, depot, n) =>
    jwt.sign({ sub: `00000000-0000-4000-8000-00000000000${n}`, username, role, outlet_id, depot, type: 'access' }, secret, {
      expiresIn: '1h',
    });
  tokens.manager = mk('manager_out001', 'store_manager', 'OUT001', null, 1);
  tokens.dispatcher = mk('dispatcher_admin', 'dispatcher', null, 'Peliyagoda', 2);
  tokens.driver = mk('driver_colombo', 'driver', null, 'Peliyagoda', 3);
  tokens.loader = mk('loader_peliyagoda', 'loader', null, 'Peliyagoda', 4);
}

async function login(username) {
  const res = await fetch(`${AUTH_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'Password123!' }),
  });
  const body = await res.json().catch(() => ({}));
  check(res.status === 200 && body.access_token, `login ${username} failed: HTTP ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}

const decode = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));

async function create(token, body, { now = PRE_CUTOFF, headers } = {}) {
  return call('POST', '/', { token, body, now, headers });
}

async function confirmedOrder(token, outlet_id, temp, date, items) {
  const created = expectStatus(
    await create(token, { outlet_id, temp_requirement: temp, order_date: date, items: items ?? (temp === 'chilled' ? CHILLED_ITEMS : AMBIENT_ITEMS) }),
    201,
  );
  expectStatus(await call('POST', `/${created.order_ref}/confirm`, { token, body: {}, now: PRE_CUTOFF }), 200);
  return created.order_ref;
}

const getOrder = async (ref, token = tokens.dispatcher) => expectStatus(await call('GET', `/${ref}`, { token }), 200);
const history = async (ref) => expectStatus(await call('GET', `/${ref}/history`, { token: tokens.dispatcher }), 200).events;
const batch = (updates, now) => call('PATCH', '/status-batch', { token: tokens.dispatcher, body: { updates }, now });

async function deliver(ref) {
  expectStatus(
    await batch([
      { order_ref: ref, status: 'allocated', vehicle_id: 'VEH001', trip_id: 1 },
      { order_ref: ref, status: 'loaded' },
      { order_ref: ref, status: 'out_for_delivery' },
      { order_ref: ref, status: 'delivered' },
    ]),
    200,
  );
}

// ------------------------------------------------------------------ scenarios

async function main() {
  console.log(`Order Management verify — ${BASE_URL}`);
  console.log(`Synthetic test week: ${MON} (Mon) … ${SAT} (Sat); auth mode: ${AUTH_MODE}\n`);

  const ctx = {};

  await scenario(1, 'GET /health', async () => {
    const res = await call('GET', '/health');
    check(res.status === 200, `expected 200, got ${res.status}`);
    check(res.body.db === 'up', `expected db 'up', got ${res.body.db}`);
  });

  await scenario(2, 'Login manager_out001 and dispatcher_admin', async () => {
    if (AUTH_MODE === 'mint') {
      await mintTokens();
      throw new Skip('AUTH_MODE=mint: tokens signed locally, auth-rbac login not exercised');
    }
    const [m, d, dr, l] = await Promise.all(['manager_out001', 'dispatcher_admin', 'driver_colombo', 'loader_peliyagoda'].map(login));
    Object.assign(tokens, { manager: m.access_token, dispatcher: d.access_token, driver: dr.access_token, loader: l.access_token });
    const mp = decode(tokens.manager);
    const dp = decode(tokens.dispatcher);
    check(mp.role === 'store_manager' && mp.outlet_id === 'OUT001', `manager token claims wrong: ${JSON.stringify(mp)}`);
    check(dp.role === 'dispatcher', `dispatcher token role wrong: ${dp.role}`);
  });

  if (!tokens.manager) {
    console.log('\nCannot continue without tokens. Is auth-rbac healthy? (Or run with AUTH_MODE=mint.)');
    return;
  }

  await scenario(3, 'Create draft on OUT001 with 3 items; rollups match hand-computed sums', async () => {
    const data = expectStatus(await create(tokens.manager, { temp_requirement: 'ambient', items: AMBIENT_ITEMS }), 201);
    ctx.s3 = data.order_ref;
    check(data.status === 'draft' && data.outlet_id === 'OUT001', `unexpected order ${data.status} ${data.outlet_id}`);
    const o = await getOrder(ctx.s3);
    check(o.order_units === AMBIENT_TOTALS.units, `units ${o.order_units} != ${AMBIENT_TOTALS.units}`);
    check(approx(o.order_weight_kg, AMBIENT_TOTALS.weight), `weight ${o.order_weight_kg} != ${AMBIENT_TOTALS.weight}`);
    check(approx(o.order_volume_m3, AMBIENT_TOTALS.volume), `volume ${o.order_volume_m3} != ${AMBIENT_TOTALS.volume}`);
    check(o.items.length === 3, `expected 3 items, got ${o.items.length}`);
    check(o.events.length === 1 && o.events[0].to_status === 'draft', 'expected a single null→draft event');
  });

  await scenario(4, 'Confirm pre-cutoff (Mon 15:59:59) → next operating day', async () => {
    const data = expectStatus(await call('POST', `/${ctx.s3}/confirm`, { token: tokens.manager, body: {}, now: at(MON, '15:59:59') }), 200);
    check(data.rolled_to_next_run === false, 'rolled_to_next_run should be false');
    const o = await getOrder(ctx.s3);
    check(o.status === 'confirmed' && o.order_date === TUE, `expected confirmed ${TUE}, got ${o.status} ${o.order_date}`);
    check(o.original_order_date === TUE, 'original_order_date should equal the confirmed date');
  });

  await scenario(5, 'Confirm at cutoff (Mon 16:00) without flag → 409 CUTOFF_PASSED', async () => {
    const d = expectStatus(await create(tokens.manager, { temp_requirement: 'chilled', items: CHILLED_ITEMS }), 201);
    ctx.s5 = d.order_ref;
    const res = await call('POST', `/${ctx.s5}/confirm`, { token: tokens.manager, body: {}, now: at(MON, '16:00:00') });
    expectStatus(res, 409, 'CUTOFF_PASSED');
    check(res.body.error.details?.next_available_date === WED, `next_available_date ${res.body.error.details?.next_available_date} != ${WED}`);
    check((await getOrder(ctx.s5)).status === 'draft', 'order must still be draft');
  });

  await scenario(6, 'Same, with accept_next_run → next-next operating day', async () => {
    const data = expectStatus(
      await call('POST', `/${ctx.s5}/confirm`, { token: tokens.manager, body: { accept_next_run: true }, now: at(MON, '16:00:00') }),
      200,
    );
    check(data.rolled_to_next_run === true, 'rolled_to_next_run should be true');
    const o = await getOrder(ctx.s5);
    check(o.status === 'confirmed' && o.order_date === WED, `expected confirmed ${WED}, got ${o.status} ${o.order_date}`);
  });

  await scenario(7, 'Confirm Saturday 15:00 → Monday (Sunday skipped)', async () => {
    const d = expectStatus(await create(tokens.manager, { temp_requirement: 'ambient', items: AMBIENT_ITEMS }, { now: at(SAT, '09:00') }), 201);
    expectStatus(await call('POST', `/${d.order_ref}/confirm`, { token: tokens.manager, body: {}, now: at(SAT, '15:00') }), 200);
    const o = await getOrder(d.order_ref);
    check(o.order_date === NEXT_MON, `expected ${NEXT_MON} (Mon), got ${o.order_date}`);
    ctx.s7 = d.order_ref;
  });

  await scenario(8, 'Confirm with zero items → 422 EMPTY_ORDER', async () => {
    const d = expectStatus(
      await create(tokens.dispatcher, { outlet_id: 'OUT050', temp_requirement: 'ambient', order_date: THU, items: [] }),
      201,
    );
    ctx.s8 = d.order_ref;
    expectStatus(await call('POST', `/${ctx.s8}/confirm`, { token: tokens.dispatcher, body: {}, now: PRE_CUTOFF }), 422, 'EMPTY_ORDER');
    check((await getOrder(ctx.s8)).status === 'draft', 'order must still be draft');
  });

  await scenario(9, 'is_chilled item on an ambient order → 422 CHILLED_MISMATCH', async () => {
    expectStatus(
      await call('PUT', `/${ctx.s8}/items`, { token: tokens.dispatcher, body: { items: CHILLED_ITEMS }, now: PRE_CUTOFF }),
      422,
      'CHILLED_MISMATCH',
    );
    check((await getOrder(ctx.s8)).items.length === 0, 'basket must be unchanged');
  });

  await scenario(10, 'Second ambient order, same outlet + date → 409 DUPLICATE_ORDER', async () => {
    const res = await create(tokens.dispatcher, { outlet_id: 'OUT050', temp_requirement: 'ambient', order_date: THU, items: AMBIENT_ITEMS });
    expectStatus(res, 409, 'DUPLICATE_ORDER');
    check(res.body.error.details?.existing_order_ref === ctx.s8, `existing_order_ref ${res.body.error.details?.existing_order_ref} != ${ctx.s8}`);
  });

  await scenario(11, 'Chilled order, same outlet + same date → 201 (legal for Fresh)', async () => {
    const d = expectStatus(
      await create(tokens.dispatcher, { outlet_id: 'OUT050', temp_requirement: 'chilled', order_date: THU, items: CHILLED_ITEMS }),
      201,
    );
    ctx.s11 = d.order_ref;
    check(d.temp_requirement === 'chilled' && d.order_date === THU, 'unexpected chilled order');
  });

  await scenario(12, 'manager_out001 reads an OUT050 order → 403 OUTLET_SCOPE_VIOLATION', async () => {
    expectStatus(await call('GET', `/${ctx.s11}`, { token: tokens.manager }), 403, 'OUTLET_SCOPE_VIOLATION');
  });

  await scenario(13, "manager_out001 creates with outlet_id 'OUT050' → 403 (documented: explicit mismatch rejected)", async () => {
    const before = expectStatus(await call('GET', `/?outlet_id=OUT050&from=${FRI}&to=${FRI}`, { token: tokens.dispatcher }), 200).total;
    expectStatus(
      await create(tokens.manager, { outlet_id: 'OUT050', temp_requirement: 'ambient', order_date: FRI, items: AMBIENT_ITEMS }),
      403,
      'OUTLET_SCOPE_VIOLATION',
    );
    const after = expectStatus(await call('GET', `/?outlet_id=OUT050&from=${FRI}&to=${FRI}`, { token: tokens.dispatcher }), 200).total;
    check(before === after, 'no order may be created on OUT050');
  });

  await scenario(14, 'Edit items on an allocated order → 409 ORDER_NOT_EDITABLE', async () => {
    ctx.allocated = await confirmedOrder(tokens.dispatcher, 'OUT060', 'ambient', WED);
    expectStatus(await batch([{ order_ref: ctx.allocated, status: 'allocated', vehicle_id: 'VEH030', trip_id: 2 }]), 200);
    expectStatus(
      await call('PUT', `/${ctx.allocated}/items`, { token: tokens.dispatcher, body: { items: AMBIENT_ITEMS.slice(0, 1) }, now: PRE_CUTOFF }),
      409,
      'ORDER_NOT_EDITABLE',
    );
    check((await getOrder(ctx.allocated)).items.length === 3, 'basket must be unchanged');
  });

  await scenario(15, 'Cancel a draft → 200 cancelled', async () => {
    const d = expectStatus(
      await create(tokens.dispatcher, { outlet_id: 'OUT051', temp_requirement: 'ambient', order_date: FRI, items: AMBIENT_ITEMS }),
      201,
    );
    ctx.s15 = d.order_ref;
    const data = expectStatus(await call('DELETE', `/${ctx.s15}`, { token: tokens.dispatcher, body: { reason_note: 'verify: duplicate entry' } }), 200);
    check(data.status === 'cancelled', `status ${data.status}`);
    const o = await getOrder(ctx.s15);
    check(o.status === 'cancelled' && o.events.at(-1).to_status === 'cancelled', 'cancel must persist with an event');
  });

  await scenario(16, 'Cancel an allocated order → 409 ORDER_NOT_CANCELLABLE', async () => {
    expectStatus(await call('DELETE', `/${ctx.allocated}`, { token: tokens.dispatcher, body: {} }), 409, 'ORDER_NOT_CANCELLABLE');
    check((await getOrder(ctx.allocated)).status === 'allocated', 'order must still be allocated');
  });

  await scenario(17, 'Re-create on the outlet+date+temp of a cancelled order → 201', async () => {
    const d = expectStatus(
      await create(tokens.dispatcher, { outlet_id: 'OUT051', temp_requirement: 'ambient', order_date: FRI, items: AMBIENT_ITEMS }),
      201,
    );
    check(d.order_ref !== ctx.s15, 'must be a new order');
  });

  await scenario(18, 'GET /confirmed carries Planning fields and consistent totals', async () => {
    ctx.planA = await confirmedOrder(tokens.dispatcher, 'OUT052', 'ambient', FRI);
    ctx.planB = await confirmedOrder(tokens.dispatcher, 'OUT053', 'chilled', FRI);
    const data = expectStatus(await call('GET', `/confirmed?date=${FRI}`, { token: tokens.loader }), 200);
    check(data.date === FRI && Array.isArray(data.orders), 'bad envelope');
    check(data.orders.length >= 2, `expected ≥2 rows, got ${data.orders.length}`);
    const required = ['window_open_time', 'window_close_time', 'dock_type', 'parking_constraint', 'deferral_count', 'days_since_last_served', 'district', 'mall_window', 'original_order_date'];
    for (const row of data.orders) {
      for (const f of required) check(row[f] !== undefined && row[f] !== null, `row ${row.order_ref} missing ${f}`);
      check(/^\d{2}:\d{2}$/.test(row.window_open_time), `window_open_time not HH:mm: ${row.window_open_time}`);
    }
    const sum = (k) => data.orders.reduce((s, r) => s + r[k], 0);
    const t = data.totals;
    check(t.orders === data.orders.length, 'totals.orders mismatch');
    check(t.units === sum('order_units'), 'totals.units mismatch');
    check(approx(t.weight_kg, sum('order_weight_kg'), 0.011), 'totals.weight_kg mismatch');
    check(approx(t.volume_m3, sum('order_volume_m3'), 0.0011), 'totals.volume_m3 mismatch');
    const chilled = data.orders.filter((r) => r.temp_requirement === 'chilled');
    check(t.chilled_orders === chilled.length, 'totals.chilled_orders mismatch');
  });

  await scenario(19, 'PATCH /status-batch → 2× allocated persists vehicle/trip and writes events', async () => {
    const data = expectStatus(
      await batch([
        { order_ref: ctx.planA, status: 'allocated', vehicle_id: 'VEH012', trip_id: 1 },
        { order_ref: ctx.planB, status: 'allocated', vehicle_id: 'VEH003', trip_id: 1 },
      ]),
      200,
    );
    check(data.updated === 2, `updated ${data.updated}`);
    for (const [ref, veh] of [[ctx.planA, 'VEH012'], [ctx.planB, 'VEH003']]) {
      const o = await getOrder(ref);
      check(o.status === 'allocated' && o.vehicle_id === veh && o.trip_id === 1, `${ref} not allocated to ${veh}`);
      const ev = await history(ref);
      check(ev.at(-1).from_status === 'confirmed' && ev.at(-1).to_status === 'allocated', `${ref} missing allocation event`);
    }
  });

  await scenario(20, 'PATCH /status-batch with trip_id 3 → 422, nothing applied', async () => {
    ctx.c = await confirmedOrder(tokens.dispatcher, 'OUT054', 'ambient', TUE);
    const res = await batch([{ order_ref: ctx.c, status: 'allocated', vehicle_id: 'VEH040', trip_id: 3 }]);
    expectStatus(res, 422);
    check(res.body.error.details?.failures?.[0]?.order_ref === ctx.c, 'failure must name the order');
    const o = await getOrder(ctx.c);
    check(o.status === 'confirmed' && o.vehicle_id === null, 'order must be untouched');
  });

  await scenario(21, 'PATCH /status-batch valid + unknown ref → 422 and the valid one is NOT applied', async () => {
    const res = await batch([
      { order_ref: ctx.c, status: 'allocated', vehicle_id: 'VEH040', trip_id: 1 },
      { order_ref: 'ORD-00000000-99999', status: 'allocated', vehicle_id: 'VEH041', trip_id: 1 },
    ]);
    expectStatus(res, 422);
    const failures = res.body.error.details?.failures ?? [];
    check(failures.length === 1 && failures[0].code === 'ORDER_NOT_FOUND', `failures: ${JSON.stringify(failures)}`);
    const o = await getOrder(ctx.c);
    check(o.status === 'confirmed' && o.vehicle_id === null, 'valid entry must have been rolled back');
  });

  await scenario(22, 'Defer without reason_code → 422 DEFERRAL_REASON_REQUIRED', async () => {
    expectStatus(await call('POST', `/${ctx.c}/defer`, { token: tokens.dispatcher, body: {} }), 422, 'DEFERRAL_REASON_REQUIRED');
    check((await getOrder(ctx.c)).deferral_count === 0, 'no deferral may be recorded');
  });

  await scenario(23, 'Defer with DISPATCHER_OVERRIDE and no note → 422 DEFERRAL_REASON_REQUIRED', async () => {
    expectStatus(
      await call('POST', `/${ctx.c}/defer`, { token: tokens.dispatcher, body: { reason_code: 'DISPATCHER_OVERRIDE' } }),
      422,
      'DEFERRAL_REASON_REQUIRED',
    );
  });

  await scenario(24, 'Valid deferral: count+1, date moves, original unchanged, outlet flagged, 2 events', async () => {
    const before = await getOrder(ctx.c);
    const data = expectStatus(
      await call('POST', `/${ctx.c}/defer`, { token: tokens.dispatcher, body: { reason_code: 'CAPACITY_WEIGHT', reason_note: 'verify' } }),
      200,
    );
    check(data.deferral_count === 1, `deferral_count ${data.deferral_count}`);
    check(data.order_date === nextOperatingDay(before.order_date), `order_date ${data.order_date}`);
    check(data.original_order_date === before.original_order_date, 'original_order_date changed');
    check(data.status === 'confirmed', `status ${data.status} (should be back in the pool)`);
    const ev = await history(ctx.c);
    const [a, b] = ev.slice(-2);
    check(a.from_status === 'confirmed' && a.to_status === 'deferred' && a.reason_code === 'CAPACITY_WEIGHT', 'missing confirmed→deferred');
    check(b.from_status === 'deferred' && b.to_status === 'confirmed', 'missing deferred→confirmed');
    const planning = expectStatus(await call('GET', `/confirmed?date=${data.order_date}`, { token: tokens.dispatcher }), 200);
    const row = planning.orders.find((r) => r.order_ref === ctx.c);
    check(row && row.deferred_yesterday === true, 'outlet deferred_yesterday must be true');
  });

  await scenario(25, `Defer until MAX_DEFERRALS (${MAX_DEFERRALS}) → not_run with AGED_OUT`, async () => {
    let last;
    for (let i = 1; i < MAX_DEFERRALS; i++) {
      last = expectStatus(await call('POST', `/${ctx.c}/defer`, { token: tokens.dispatcher, body: { reason_code: 'NO_VAN_FOR_VAN_ONLY_OUTLET' } }), 200);
    }
    check(last.status === 'not_run', `final status ${last.status}`);
    check(last.deferral_count === MAX_DEFERRALS, `deferral_count ${last.deferral_count}`);
    const ev = await history(ctx.c);
    check(ev.at(-1).to_status === 'not_run' && ev.at(-1).reason_code === 'AGED_OUT', 'last event must be AGED_OUT');
  });

  await scenario(26, 'GET /at-risk lists the affected outlet with flags', async () => {
    const data = expectStatus(await call('GET', '/at-risk', { token: tokens.dispatcher }), 200);
    const row = data.outlets.find((o) => o.outlet_id === 'OUT054');
    check(row, 'OUT054 not listed');
    check(row.flags.includes('CONSECUTIVE_DEFERRAL_RISK'), `flags ${row.flags}`);
    check(row.flags.includes('AGED_OUT_RECENTLY'), `flags ${row.flags}`);
    check(row.max_deferral_count >= MAX_DEFERRALS, `max_deferral_count ${row.max_deferral_count}`);
  });

  await scenario(27, 'Illegal delivered → confirmed via batch → INVALID_STATE_TRANSITION with allowed[]', async () => {
    ctx.d = await confirmedOrder(tokens.manager, 'OUT001', 'ambient', THU);
    await deliver(ctx.d);
    const res = await batch([{ order_ref: ctx.d, status: 'confirmed' }]);
    check(res.status === 409 || res.status === 422, `expected 409/422, got ${res.status}`);
    const f = res.body.error.details?.failures?.[0] ?? res.body.error;
    check(f.code === 'INVALID_STATE_TRANSITION', `code ${f.code}`);
    check(Array.isArray(f.details?.allowed) && f.details.allowed.length > 0, 'allowed[] must be populated');
    check((await getOrder(ctx.d)).status === 'delivered', 'order must still be delivered');
  });

  await scenario(28, 'Full receipt → received; outlet days_since_last_served reset', async () => {
    const o = await getOrder(ctx.d);
    const data = expectStatus(
      await call('POST', `/${ctx.d}/receipt`, { token: tokens.manager, body: { received_units: o.order_units, missing_units: 0, rejected_units: 0 } }),
      200,
    );
    check(data.order.status === 'received', `status ${data.order.status}`);
    const planning = expectStatus(await call('GET', `/confirmed?date=${NEXT_MON}`, { token: tokens.dispatcher }), 200);
    const row = planning.orders.find((r) => r.order_ref === ctx.s7);
    check(row, `OUT001 order ${ctx.s7} not in /confirmed for ${NEXT_MON}`);
    check(row.days_since_last_served === 0, `days_since_last_served ${row.days_since_last_served}`);
  });

  await scenario(29, 'Short receipt (2 missing) → disputed, receipt persisted', async () => {
    ctx.e = await confirmedOrder(tokens.manager, 'OUT001', 'chilled', FRI);
    await deliver(ctx.e);
    const o = await getOrder(ctx.e);
    const data = expectStatus(
      await call('POST', `/${ctx.e}/receipt`, {
        token: tokens.manager,
        body: { received_units: o.order_units - 2, missing_units: 2, rejected_units: 0, note: '2 crates short' },
      }),
      200,
    );
    check(data.order.status === 'disputed', `status ${data.order.status}`);
    check(data.receipt?.missing_units === 2 && data.receipt?.note === '2 crates short', 'receipt row not persisted');
    check((await getOrder(ctx.e)).status === 'disputed', 'status not persisted');
  });

  await scenario(30, "Receipt units don't sum to order_units → 422 RECEIPT_UNITS_MISMATCH", async () => {
    ctx.f = await confirmedOrder(tokens.manager, 'OUT001', 'ambient', FRI);
    await deliver(ctx.f);
    expectStatus(
      await call('POST', `/${ctx.f}/receipt`, { token: tokens.manager, body: { received_units: 1, missing_units: 0, rejected_units: 0 } }),
      422,
      'RECEIPT_UNITS_MISMATCH',
    );
    check((await getOrder(ctx.f)).status === 'delivered', 'order must still be delivered');
  });

  await scenario(31, 'Second receipt on the same order → 409 RECEIPT_ALREADY_RECORDED', async () => {
    expectStatus(
      await call('POST', `/${ctx.d}/receipt`, { token: tokens.manager, body: { received_units: 1, missing_units: 0, rejected_units: 0 } }),
      409,
      'RECEIPT_ALREADY_RECORDED',
    );
  });

  await scenario(32, 'No Authorization header → 401 UNAUTHORIZED', async () => {
    expectStatus(await call('GET', `/confirmed?date=${FRI}`), 401, 'UNAUTHORIZED');
  });

  await scenario(33, 'Garbage token → 401 INVALID_TOKEN', async () => {
    expectStatus(await call('GET', `/confirmed?date=${FRI}`, { token: 'not.a.jwt' }), 401, 'INVALID_TOKEN');
  });

  await scenario(34, 'driver_colombo on GET /confirmed → 403 FORBIDDEN', async () => {
    expectStatus(await call('GET', `/confirmed?date=${FRI}`, { token: tokens.driver }), 403, 'FORBIDDEN');
  });

  await scenario(35, 'loader_peliyagoda on POST / → 403 FORBIDDEN', async () => {
    expectStatus(await create(tokens.loader, { outlet_id: 'OUT050', temp_requirement: 'ambient', items: AMBIENT_ITEMS }), 403, 'FORBIDDEN');
  });

  const idemKey = `verify-${MON}-${Date.now()}`;
  const idemBody = { outlet_id: 'OUT055', temp_requirement: 'ambient', order_date: SAT, items: AMBIENT_ITEMS };

  await scenario(36, 'Idempotency-Key replay with identical body → 200 idempotent_replay, one row', async () => {
    const first = expectStatus(await create(tokens.dispatcher, idemBody, { headers: { 'Idempotency-Key': idemKey } }), 201);
    const replay = expectStatus(await create(tokens.dispatcher, idemBody, { headers: { 'Idempotency-Key': idemKey } }), 200);
    check(replay.idempotent_replay === true, 'idempotent_replay flag missing');
    check(replay.order_ref === first.order_ref, 'replay returned a different order');
    const list = expectStatus(await call('GET', `/?outlet_id=OUT055&from=${SAT}&to=${SAT}`, { token: tokens.dispatcher }), 200);
    check(list.total === 1, `expected exactly one row, found ${list.total}`);
  });

  await scenario(37, 'Idempotency-Key reuse with a different body → 409 IDEMPOTENCY_KEY_CONFLICT', async () => {
    expectStatus(
      await create(tokens.dispatcher, { ...idemBody, items: AMBIENT_ITEMS.slice(0, 1) }, { headers: { 'Idempotency-Key': idemKey } }),
      409,
      'IDEMPOTENCY_KEY_CONFLICT',
    );
  });

  await scenario(38, 'Unknown outlet_id → 404 OUTLET_NOT_FOUND', async () => {
    expectStatus(await create(tokens.dispatcher, { outlet_id: 'OUT999', temp_requirement: 'ambient', items: AMBIENT_ITEMS }), 404, 'OUTLET_NOT_FOUND');
  });

  await scenario(39, 'Explicit order_date on a Sunday → 422 NON_OPERATING_DATE', async () => {
    expectStatus(
      await create(tokens.dispatcher, { outlet_id: 'OUT056', temp_requirement: 'ambient', order_date: SUN, items: AMBIENT_ITEMS }),
      422,
      'NON_OPERATING_DATE',
    );
  });

  await scenario(40, 'GET /:ref/history after a defer cycle: oldest-first, reasons and roles present', async () => {
    const ev = await history(ctx.c);
    for (let i = 1; i < ev.length; i++) {
      check(new Date(ev[i - 1].occurred_at) <= new Date(ev[i].occurred_at), 'events are not oldest-first');
    }
    check(ev[0].from_status === null && ev[0].to_status === 'draft', 'first event must be null→draft');
    const defers = ev.filter((e) => e.to_status === 'deferred');
    check(defers.length === MAX_DEFERRALS, `expected ${MAX_DEFERRALS} deferral events, got ${defers.length}`);
    check(defers.every((e) => e.reason_code && e.actor_role === 'dispatcher'), 'deferrals need reason_code and actor_role');
    check(ev.every((e) => e.actor_role), 'every event needs an actor_role');
  });

  await scenario(41, 'POST /close-window runs once; an identical second call is a no-op', async () => {
    const first = expectStatus(await call('POST', '/close-window', { token: tokens.dispatcher, body: { date: NEXT_TUE } }), 200);
    check(first.already_ran === false && first.result?.closing_date === NEXT_TUE, `first run: ${JSON.stringify(first).slice(0, 200)}`);
    check(typeof first.result.deferred_swept_to_confirmed === 'number', 'sweep count missing');
    const second = expectStatus(await call('POST', '/close-window', { token: tokens.dispatcher, body: { date: NEXT_TUE } }), 200);
    check(second.already_ran === true, 'second call must report already_ran');
    check(JSON.stringify(second.result) === JSON.stringify(first.result), 'second call must not change the result');
  });

  await scenario(42, 'GET /summary on a seeded day: status/brand/temperature sections and a consistent chilled capacity reference', async () => {
    let today = colomboToday();
    let found;
    for (let i = -10; i <= 10 && !found; i++) {
      const date = addDays(today, i);
      if (weekday(date) === 0) continue;
      const data = expectStatus(await call('GET', `/summary?date=${date}&depot=Peliyagoda`, { token: tokens.dispatcher }), 200);
      if (Object.values(data.by_status ?? {}).reduce((s, n) => s + n, 0) > 0) found = data;
    }
    check(found, 'no seeded day found around today (was SEED_DEMO_DATA disabled?)');
    const ref = found.chilled_capacity_reference;
    check(ref.available && ref.capacity_m3 > 0 && ref.demand_m3 >= 0, `capacity reference ${JSON.stringify(ref)}`);
    check(ref.exceeds_capacity === ref.demand_m3 > ref.capacity_m3, `exceeds_capacity ${ref.exceeds_capacity} for ${ref.demand_m3}/${ref.capacity_m3} m3`);
    check(found.by_status && found.by_brand && found.by_temperature, 'summary sections missing');
  });

  await scenario(43, 'Pagination page_size=10 over 25+ rows: correct total, no duplicates or gaps', async () => {
    const q = '/?status=confirmed&depot=Peliyagoda';
    const all = expectStatus(await call('GET', `${q}&page_size=30`, { token: tokens.dispatcher }), 200);
    check(all.total >= 25, `need ≥25 rows, have ${all.total}`);
    const pages = [];
    for (let p = 1; p <= 3; p++) {
      const page = expectStatus(await call('GET', `${q}&page_size=10&page=${p}`, { token: tokens.dispatcher }), 200);
      check(page.total === all.total, 'total differs between pages');
      check(page.page === p && page.page_size === 10, 'page metadata wrong');
      pages.push(...page.orders.map((o) => o.order_ref));
    }
    check(new Set(pages).size === 30, 'duplicate rows across pages');
    check(JSON.stringify(pages) === JSON.stringify(all.orders.map((o) => o.order_ref)), 'paged rows differ from a single page');
  });

  await scenario(44, 'Malformed JSON body → 400 VALIDATION_ERROR (not 500)', async () => {
    expectStatus(await call('POST', '/', { token: tokens.dispatcher, rawBody: '{"outlet_id": "OUT050",' }), 400, 'VALIDATION_ERROR');
  });

  await scenario(45, 'Unknown query param / extra body field → ignored, not 500', async () => {
    expectStatus(await call('GET', `/confirmed?date=${FRI}&foo=bar&depot=Peliyagoda`, { token: tokens.dispatcher }), 200);
    const d = expectStatus(
      await create(tokens.dispatcher, { outlet_id: 'OUT057', temp_requirement: 'ambient', order_date: THU, items: AMBIENT_ITEMS, hack: true, priority: 99 }),
      201,
    );
    check(d.hack === undefined && d.priority === undefined, 'unknown fields must not be echoed or stored');
  });

  await scenario(46, 'PATCH /:ref/status: loader loads, driver takes out and delivers; roles recorded', async () => {
    ctx.g = await confirmedOrder(tokens.dispatcher, 'OUT060', 'ambient', THU);
    expectStatus(await call('PATCH', `/${ctx.g}/status`, { token: tokens.dispatcher, body: { status: 'allocated', vehicle_id: 'VEH020', trip_id: 2 } }), 200);
    expectStatus(await call('PATCH', `/${ctx.g}/status`, { token: tokens.loader, body: { status: 'loaded' } }), 200);
    expectStatus(await call('PATCH', `/${ctx.g}/status`, { token: tokens.driver, body: { status: 'out_for_delivery' } }), 200);
    const data = expectStatus(await call('PATCH', `/${ctx.g}/status`, { token: tokens.driver, body: { status: 'delivered', reason_note: 'POD signed' } }), 200);
    check(data.status === 'delivered' && data.vehicle_id === 'VEH020' && data.trip_id === 2, `unexpected order ${data.status} ${data.vehicle_id}`);
    const roles = (await history(ctx.g)).slice(-4).map((e) => `${e.to_status}:${e.actor_role}`);
    check(
      JSON.stringify(roles) === JSON.stringify(['allocated:dispatcher', 'loaded:loader', 'out_for_delivery:driver', 'delivered:driver']),
      `events ${roles}`,
    );
  });

  await scenario(47, 'PATCH /:ref/status enforces role limits and the state machine', async () => {
    const o = await confirmedOrder(tokens.dispatcher, 'OUT060', 'ambient', SAT);
    expectStatus(await call('PATCH', `/${o}/status`, { token: tokens.driver, body: { status: 'allocated', vehicle_id: 'VEH020', trip_id: 1 } }), 403, 'FORBIDDEN');
    expectStatus(await call('PATCH', `/${o}/status`, { token: tokens.loader, body: { status: 'delivered' } }), 403, 'FORBIDDEN');
    expectStatus(await call('PATCH', `/${o}/status`, { token: tokens.manager, body: { status: 'loaded' } }), 403, 'FORBIDDEN');
    const res = await call('PATCH', `/${o}/status`, { token: tokens.driver, body: { status: 'delivered' } });
    expectStatus(res, 409, 'INVALID_STATE_TRANSITION');
    check(Array.isArray(res.body.error.details?.allowed), 'allowed[] must be populated');
    expectStatus(await call('PATCH', `/${o}/status`, { token: tokens.dispatcher, body: { status: 'received' } }), 409, 'INVALID_STATE_TRANSITION');
    check((await getOrder(o)).status === 'confirmed', 'order must be untouched');
  });

  await scenario(48, 'Swagger: /openapi.json and /docs are public and cover every operation with examples', async () => {
    const res = await call('GET', '/openapi.json');
    check(res.status === 200 && res.body.openapi?.startsWith('3.'), `openapi.json: HTTP ${res.status}`);
    const ops = Object.values(res.body.paths).flatMap((p) => Object.values(p));
    check(ops.length >= 16, `expected ≥16 operations, got ${ops.length}`);
    check(ops.every((op) => op.operationId), 'every operation needs an operationId');
    const create = res.body.paths['/'].post;
    check(Object.keys(create.requestBody.content['application/json'].examples).length >= 2, 'create needs request examples');
    check(create.parameters.some((p) => p.name === 'Idempotency-Key' && p.in === 'header'), 'Idempotency-Key header undocumented');
    const html = await fetch(`${BASE_URL}/docs/`);
    check(html.status === 200 && (await html.text()).includes('swagger-ui'), `/docs/: HTTP ${html.status}`);
  });

  await scenario(49, 'Reference data: outlets synced from the database; /summary capacity comes from Fleet or says it is unavailable', async () => {
    const health = await call('GET', '/health');
    const outlets = health.body.reference_data?.outlets;
    check(outlets && outlets.last_synced_at, `outlets were never synced: ${JSON.stringify(health.body.reference_data)}`);
    check(outlets.outlets > 0 && outlets.last_error === null, `outlet sync problem: ${JSON.stringify(outlets)}`);
    const summary = expectStatus(await call('GET', '/summary?depot=Peliyagoda', { token: tokens.dispatcher }), 200);
    const cap = summary.chilled_capacity_reference;
    if (cap.available) {
      check(cap.reefer_vehicles > 0 && cap.capacity_m3 > 0, 'capacity must be positive when available');
    } else {
      check(cap.capacity_m3 === null && cap.exceeds_capacity === null, 'unavailable capacity must be null, not estimated');
    }
    console.log(`      outlets: ${outlets.outlets} from the database; reefer capacity: ${cap.available ? `${cap.reefer_vehicles} reefers, ${cap.capacity_m3} m3 (Fleet API)` : 'unavailable (Fleet unreachable)'}`);
  });
}

const TOTAL_SCENARIOS = 49;

main()
  .catch((err) => {
    console.error('\nverify aborted:', err);
    results.push({ id: 0, status: 'FAIL' });
  })
  .finally(() => {
    const count = (s) => results.filter((r) => r.status === s).length;
    console.log(`\nSummary: ${count('PASS')} passed, ${count('FAIL')} failed, ${count('SKIP')} skipped (of ${TOTAL_SCENARIOS})`);
    process.exit(count('FAIL') > 0 || results.length < TOTAL_SCENARIOS ? 1 : 0);
  });
