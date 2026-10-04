#!/usr/bin/env node
/**
 * Regenerates seed-data/store-managers.csv: one store manager account per outlet in the challenge
 * dataset (data/General Data/outlets.csv). The CSV is committed, so the service seeds from it
 * without the dataset.
 *
 * The username is "manager_" + the lowercase outlet id (OUT007 -> manager_out007); every account
 * uses the shared demo password. Names, emails and phone numbers are fictional and picked
 * deterministically; OUT001 keeps the demo manager's name.
 *
 * Run from the repo root:  node services/auth-rbac/scripts/build-store-manager-seed.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');

const FIRST = ['Nimal', 'Sanduni', 'Kamal', 'Dilini', 'Pradeep', 'Ayesha', 'Saman', 'Nadeesha', 'Lasith', 'Imesha',
  'Mahesh', 'Tharushi', 'Chathura', 'Hiruni', 'Rajitha', 'Sachini', 'Buddhika', 'Madhavi', 'Janaka', 'Kavindi'];
const LAST = ['Fernando', 'Perera', 'Silva', 'Jayawardena', 'Bandara', 'Wickramasinghe', 'Ratnayake', 'Herath',
  'Gunathilaka', 'Dissanayake', 'Kumari', 'Weerakoon', 'Samarasinghe', 'Abeywickrama', 'Liyanage'];

const [head, ...lines] = readFileSync(path.join(root, 'data/General Data/outlets.csv'), 'utf8').trim().split(/\r?\n/);
const cols = head.split(',').map((c) => c.trim());
const outlets = lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v.trim()])));

const rows = outlets.map((o) => {
  const n = Number(o.outlet_id.replace(/\D/g, ''));
  const id = o.outlet_id.toLowerCase();
  const name = n === 1 ? 'Nimal Fernando' : `${FIRST[(n * 7 + Math.floor(n / 60) * 3) % FIRST.length]} ${LAST[(n * 11 + Math.floor(n / 60)) % LAST.length]}`;
  return [o.outlet_id, `manager_${id}`, name, `manager.${id}@waypath.example`, `+94 71 000 ${String(n).padStart(4, '0')}`];
});

writeFileSync(
  path.resolve(here, '../seed-data/store-managers.csv'),
  ['outlet_id,username,full_name,email,phone', ...rows.map((r) => r.join(','))].join('\n') + '\n',
);
console.log(`seed-data/store-managers.csv: ${rows.length} store managers`);
