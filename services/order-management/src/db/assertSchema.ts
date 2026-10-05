import { OUTLET_DIRECTORY_COLUMNS, OUTLET_DIRECTORY_TABLE } from '../repositories/outlets.repo.js';
import { pool } from './pool.js';

/**
 * Verifies the Order Management migration has been applied. Read-only: this service
 * never issues DDL. Tables come from infrastructure/postgres-init/02-order-management.sql.
 */

const MIGRATION_FILE = 'infrastructure/postgres-init/02-order-management.sql';

export const REQUIRED_SCHEMA: Readonly<Record<string, readonly string[]>> = {
  outlets_ref: [
    'outlet_id', 'brand', 'district', 'depot', 'dock_type', 'parking_constraint', 'mall_window',
    'window_open_time', 'window_close_time', 'deferred_yesterday', 'days_since_last_served',
    'last_served_date', 'updated_at',
  ],
  orders: [
    'order_ref', 'outlet_id', 'brand', 'depot', 'order_date', 'original_order_date', 'requested_order_date',
    'temp_requirement', 'status', 'order_units', 'order_weight_kg', 'order_volume_m3', 'window_open_time',
    'window_close_time', 'placed_by', 'placed_by_username', 'placed_at', 'confirmed_at', 'cutoff_applied_at',
    'deferral_count', 'vehicle_id', 'trip_id', 'idempotency_key', 'idempotency_fingerprint', 'created_at',
    'updated_at',
  ],
  order_items: [
    'id', 'order_ref', 'sku', 'description', 'quantity', 'unit_weight_kg', 'unit_volume_m3', 'is_chilled',
    'created_at',
  ],
  order_status_events: [
    'id', 'order_ref', 'from_status', 'to_status', 'reason_code', 'reason_note', 'actor_id', 'actor_role',
    'occurred_at',
  ],
  order_receipts: [
    'id', 'order_ref', 'received_units', 'missing_units', 'rejected_units', 'note', 'received_by', 'received_at',
  ],
  products: ['sku', 'description', 'brand', 'temp_requirement', 'unit_weight_kg', 'unit_volume_m3', 'active', 'created_at'],
  service_jobs: ['job_name', 'job_key', 'ran_at', 'result'],
};

const REQUIRED_SEQUENCES = ['orders_ref_seq'];

export class SchemaAssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaAssertionError';
  }
}

function missingTablesMessage(tables: string[]): string {
  return [
    `❌ FATAL: missing table(s): ${tables.join(', ')}.`,
    '   The Order Management migration has not been applied to this database.',
    '   Scripts in postgres-init only run on an EMPTY volume, so adding the file is not enough',
    '   on an existing one. Apply it with:',
    '',
    `     docker compose exec -T postgres psql -U postgres -d delivery_db < ${MIGRATION_FILE}`,
    '',
    '   Or start clean:  docker compose down -v && docker compose up --build',
  ].join('\n');
}

function missingColumnsMessage(table: string, columns: string[]): string {
  return [
    `❌ FATAL: table "${table}" exists but is missing required column(s): ${columns.join(', ')}.`,
    '   Another service probably created this table first (CREATE TABLE IF NOT EXISTS is silent).',
    `   Order Management is the sole owner of this table — see ${MIGRATION_FILE}.`,
    '   Fix: have the other owner rename their table, then re-apply the migration.',
  ].join('\n');
}

export async function assertSchema(): Promise<void> {
  const tableNames = Object.keys(REQUIRED_SCHEMA);

  const { rows: columnRows } = await pool.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`,
    [tableNames],
  );

  const present = new Map<string, Set<string>>();
  for (const { table_name, column_name } of columnRows) {
    if (!present.has(table_name)) present.set(table_name, new Set());
    present.get(table_name)!.add(column_name);
  }

  const missingTables = tableNames.filter((t) => !present.has(t));
  if (missingTables.length > 0) {
    throw new SchemaAssertionError(missingTablesMessage(missingTables));
  }

  const columnProblems = tableNames
    .map((table) => ({ table, missing: REQUIRED_SCHEMA[table].filter((c) => !present.get(table)!.has(c)) }))
    .filter((p) => p.missing.length > 0);
  if (columnProblems.length > 0) {
    throw new SchemaAssertionError(columnProblems.map((p) => missingColumnsMessage(p.table, p.missing)).join('\n\n'));
  }

  const { rows: seqRows } = await pool.query<{ sequence_name: string }>(
    `SELECT sequence_name FROM information_schema.sequences
      WHERE sequence_schema = current_schema() AND sequence_name = ANY($1::text[])`,
    [REQUIRED_SEQUENCES],
  );
  const missingSeqs = REQUIRED_SEQUENCES.filter((s) => !seqRows.some((r) => r.sequence_name === s));
  if (missingSeqs.length > 0) {
    throw new SchemaAssertionError(missingTablesMessage(missingSeqs).replace('missing table(s)', 'missing sequence(s)'));
  }

  await assertOutletDirectory();

  console.log(`✅ Order Management schema verified (${tableNames.length} tables, ${REQUIRED_SEQUENCES.length} sequence, outlet directory present).`);
}

/**
 * Outlets are read from Fleet & Directory's table in this database. There is no embedded
 * copy to fall back on, so its absence stops the boot with instructions instead of letting
 * the service run with no outlets.
 */
async function assertOutletDirectory(): Promise<void> {
  const { rows } = await pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = $1`,
    [OUTLET_DIRECTORY_TABLE],
  );
  const present = new Set(rows.map((r) => r.column_name));
  const init = 'infrastructure/postgres-init/02-init-fleet.sql';

  if (present.size === 0) {
    throw new SchemaAssertionError(
      [
        `❌ FATAL: table "${OUTLET_DIRECTORY_TABLE}" does not exist.`,
        '   Order Management reads outlets from Fleet & Directory\'s table and has no built-in copy.',
        `   It is created and loaded from data/outlets.csv by ${init}, which only runs on an EMPTY volume.`,
        '   Start clean:  docker compose down -v && docker compose up --build',
      ].join('\n'),
    );
  }
  const missing = OUTLET_DIRECTORY_COLUMNS.filter((c) => !present.has(c));
  if (missing.length > 0) {
    throw new SchemaAssertionError(
      [
        `❌ FATAL: table "${OUTLET_DIRECTORY_TABLE}" is missing column(s) Order Management reads: ${missing.join(', ')}.`,
        `   The table is owned by Fleet & Directory (${init}); its shape has changed.`,
        '   Fix: agree the outlet columns with the Fleet & Directory owner, then update outlets.repo.ts.',
      ].join('\n'),
    );
  }
}
