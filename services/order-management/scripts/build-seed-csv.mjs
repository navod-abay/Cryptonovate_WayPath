#!/usr/bin/env node
/**
 * Regenerates seed-data/orders.csv and seed-data/outlet_state.csv from the challenge dataset.
 * Only needed to pick different days: the CSVs are committed, and the service seeds from them
 * on `docker compose up` without the dataset.
 *
 * Orders: the last DAYS operating days of the Task 1 test inputs (the window algorithm 3 was
 * back-tested on). Each row stores an `offset` instead of a date: dataset day i becomes operating
 * day (i - PAST_DAYS) relative to the day the service seeds.
 * Outlet state: days since last served / deferred on the previous run, from the history before
 * that window.
 *
 * Run from the repo root:  node services/order-management/scripts/build-seed-csv.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DAYS = 11;
const PAST_DAYS = 2;

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const out = path.resolve(here, '../seed-data');

// The dataset CSVs have no quoted fields.
function read(rel) {
  const [head, ...lines] = readFileSync(path.join(root, 'data', rel), 'utf8').trim().split(/\r?\n/);
  const cols = head.split(',').map((c) => c.trim());
  return lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v.trim()])));
}

const test = read('Test Data/task1_test_inputs.csv');
const history = [...read('Training Data/deliveries_train.csv'), ...test];
const operating = read('General Data/calendar.csv').filter((r) => r.is_operating === '1').map((r) => r.date);
const opIndex = new Map(operating.map((d, i) => [d, i]));

const block = [...new Set(test.map((r) => r.order_date))].sort().slice(-DAYS);
const first = block[0];
const prev = operating.filter((d) => d < first).at(-1); // the run before the block

const orderRows = [['offset', 'source_date', 'delivery_id', 'outlet_id', 'temp_requirement', 'order_units', 'order_weight_kg', 'order_volume_m3']];
block.forEach((date, i) => {
  test
    .filter((r) => r.order_date === date)
    .sort((a, b) => a.delivery_id.localeCompare(b.delivery_id))
    .forEach((r) => orderRows.push([i - PAST_DAYS, date, r.delivery_id, r.outlet_id, r.temp_requirement, r.order_units, r.order_weight_kg, r.order_volume_m3]));
});

// "attempted" orders went out on their order date, "deferred" ones on their later dispatch_date;
// "not_run" orders aged out and were never delivered.
const lastServed = new Map();
const deferred = new Set();
for (const r of history) {
  if (r.order_date >= first || r.dispatch_status === 'not_run') continue;
  const servedOn = r.dispatch_date;
  if (servedOn <= prev && servedOn > (lastServed.get(r.outlet_id) ?? '')) lastServed.set(r.outlet_id, servedOn);
  if (r.order_date <= prev && prev < servedOn) deferred.add(r.outlet_id);
}
const stateRows = [['outlet_id', 'days_since_last_served', 'deferred_yesterday']];
for (const id of read('General Data/outlets.csv').map((r) => r.outlet_id).sort()) {
  const served = lastServed.get(id);
  stateRows.push([id, opIndex.get(first) - (served ? opIndex.get(served) : 0), deferred.has(id)]);
}

mkdirSync(out, { recursive: true });
const csv = (rows) => rows.map((r) => r.join(',')).join('\n') + '\n';
writeFileSync(path.join(out, 'orders.csv'), csv(orderRows));
writeFileSync(path.join(out, 'outlet_state.csv'), csv(stateRows));
console.log(`wrote seed-data/orders.csv: ${orderRows.length - 1} orders over ${block.length} days (${block[0]} .. ${block.at(-1)}), ` +
  `offsets ${-PAST_DAYS} .. ${DAYS - PAST_DAYS - 1}; outlet_state.csv: ${stateRows.length - 1} outlets, ${deferred.size} deferred on the previous run`);
