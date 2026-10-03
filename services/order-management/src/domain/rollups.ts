export interface RollupItem {
  quantity: number;
  unit_weight_kg: number;
  unit_volume_m3: number;
}

export interface OrderRollups {
  order_units: number;
  order_weight_kg: number;
  order_volume_m3: number;
}

// Column scales from the DDL: unit_weight_kg NUMERIC(8,3), unit_volume_m3 NUMERIC(8,4).
const WEIGHT_UNIT_SCALE = 1_000;
const VOLUME_UNIT_SCALE = 10_000;

/**
 * Mirrors the SQL rollup (§5.5) in exact integer arithmetic so 120 × 1.03 is 123.60,
 * not 123.59999. Postgres NUMERIC is the source of truth; this exists for previews and tests.
 */
export function computeRollups(items: readonly RollupItem[]): OrderRollups {
  let units = 0;
  let weightMilli = 0;
  let volumeTenThousandths = 0;
  for (const item of items) {
    units += item.quantity;
    weightMilli += item.quantity * Math.round(item.unit_weight_kg * WEIGHT_UNIT_SCALE);
    volumeTenThousandths += item.quantity * Math.round(item.unit_volume_m3 * VOLUME_UNIT_SCALE);
  }
  return {
    order_units: units,
    order_weight_kg: Math.round(weightMilli / 10) / 100,
    order_volume_m3: Math.round(volumeTenThousandths / 10) / 1000,
  };
}
