import { pool, type Queryable } from '../db/pool.js';
import type { OrderItemInput } from '../schemas/orders.schema.js';

export interface OrderItemRow {
  id: string;
  order_ref: string;
  sku: string;
  description: string;
  quantity: number;
  unit_weight_kg: number;
  unit_volume_m3: number;
  is_chilled: boolean;
  created_at: Date;
}

const ITEM_COLUMNS = 'id, order_ref, sku, description, quantity, unit_weight_kg, unit_volume_m3, is_chilled, created_at';

export async function insertItems(orderRef: string, items: readonly OrderItemInput[], db: Queryable): Promise<void> {
  if (items.length === 0) return;
  await db.query(
    `INSERT INTO order_items (order_ref, sku, description, quantity, unit_weight_kg, unit_volume_m3, is_chilled)
     SELECT $1, t.sku, t.description, t.quantity, t.unit_weight_kg, t.unit_volume_m3, t.is_chilled
       FROM unnest($2::varchar[], $3::varchar[], $4::int[], $5::numeric[], $6::numeric[], $7::boolean[])
         AS t(sku, description, quantity, unit_weight_kg, unit_volume_m3, is_chilled)`,
    [
      orderRef,
      items.map((i) => i.sku),
      items.map((i) => i.description),
      items.map((i) => i.quantity),
      items.map((i) => i.unit_weight_kg),
      items.map((i) => i.unit_volume_m3),
      items.map((i) => i.is_chilled),
    ],
  );
}

export async function replaceItems(orderRef: string, items: readonly OrderItemInput[], db: Queryable): Promise<void> {
  await db.query('DELETE FROM order_items WHERE order_ref = $1', [orderRef]);
  await insertItems(orderRef, items, db);
}

export async function listItems(orderRef: string, db: Queryable = pool): Promise<OrderItemRow[]> {
  const { rows } = await db.query<OrderItemRow>(
    `SELECT ${ITEM_COLUMNS} FROM order_items WHERE order_ref = $1 ORDER BY created_at, sku`,
    [orderRef],
  );
  return rows;
}

export async function countItems(orderRef: string, db: Queryable = pool): Promise<number> {
  const { rows } = await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM order_items WHERE order_ref = $1', [orderRef]);
  return rows[0].n;
}
