import type { Queryable } from '../db/pool.js';

const ORDER_REF_PATTERN = /^ORD-\d{8}-\d{5,}$/;

/**
 * ORD-YYYYMMDD-NNNNN. YYYYMMDD is the order_date at creation; NNNNN comes from the
 * global orders_ref_seq. A sequence (not count(*)+1) keeps generation race-safe under
 * concurrent creates. The counter is global rather than per-day, which is acceptable:
 * the ref only has to be unique and human-readable, not dense within a day.
 */
export function formatOrderRef(orderDate: string, seq: number): string {
  if (!Number.isInteger(seq) || seq < 1) {
    throw new RangeError(`Order sequence must be a positive integer, got ${seq}`);
  }
  return `ORD-${orderDate.replaceAll('-', '')}-${String(seq).padStart(5, '0')}`;
}

export function isOrderRef(value: string): boolean {
  return ORDER_REF_PATTERN.test(value);
}

export async function nextOrderRef(db: Queryable, orderDate: string): Promise<string> {
  const { rows } = await db.query<{ seq: number }>(`SELECT nextval('orders_ref_seq') AS seq`);
  return formatOrderRef(orderDate, rows[0].seq);
}

export async function nextOrderRefs(db: Queryable, orderDates: readonly string[]): Promise<string[]> {
  if (orderDates.length === 0) return [];
  const { rows } = await db.query<{ seq: number }>(
    `SELECT nextval('orders_ref_seq') AS seq FROM generate_series(1, $1::int)`,
    [orderDates.length],
  );
  return orderDates.map((d, i) => formatOrderRef(d, rows[i].seq));
}
