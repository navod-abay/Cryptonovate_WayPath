#!/usr/bin/env node
/**
 * Regenerates seed-data/drivers.csv: one driver account per vehicle in the challenge dataset
 * (data/General Data/vehicles.csv), at the vehicle's depot. The CSV is committed, so the service
 * seeds from it without the dataset.
 *
 * Demo PINs are "1" + the vehicle number (VEH001 -> 1001, VEH057 -> 1057), so every PIN is unique
 * and easy to find for a demo. Names are fictional, picked deterministically.
 *
 * Run from the repo root:  node services/auth-rbac/scripts/build-driver-seed.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');

const FIRST = ['Nimal', 'Sunil', 'Kamal', 'Ajith', 'Pradeep', 'Ruwan', 'Saman', 'Chamara', 'Lasith', 'Dinesh',
  'Mahesh', 'Asanka', 'Nuwan', 'Gayan', 'Tharindu', 'Isuru', 'Kasun', 'Lahiru', 'Janaka', 'Roshan'];
const LAST = ['Perera', 'Silva', 'Fernando', 'Jayasuriya', 'Bandara', 'Wijesinghe', 'Rathnayake', 'Herath',
  'Gunawardena', 'Dissanayake', 'Kumara', 'Weerasinghe', 'Senanayake', 'Abeysekera', 'Liyanage'];

const [head, ...lines] = readFileSync(path.join(root, 'data/General Data/vehicles.csv'), 'utf8').trim().split(/\r?\n/);
const cols = head.split(',').map((c) => c.trim());
const vehicles = lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v.trim()])));

const rows = vehicles.map((v) => {
  const n = Number(v.vehicle_id.replace(/\D/g, ''));
  const name = `${FIRST[(n * 7) % FIRST.length]} ${LAST[(n * 11) % LAST.length]}`;
  const pin = `1${String(n).padStart(3, '0')}`;
  return [v.vehicle_id, v.depot, `driver_${v.vehicle_id.toLowerCase()}`, name, pin];
});

writeFileSync(
  path.resolve(here, '../seed-data/drivers.csv'),
  ['vehicle_id,depot,username,full_name,pin', ...rows.map((r) => r.join(','))].join('\n') + '\n',
);
console.log(`seed-data/drivers.csv: ${rows.length} drivers`);
