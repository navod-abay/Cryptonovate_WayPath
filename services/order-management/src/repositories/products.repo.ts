import { pool } from '../db/pool.js';
import type { Brand, TempRequirement } from '../schemas/orders.schema.js';

export type ProductCategory = 'chilled' | 'dry' | 'tech' | 'style';

export interface ProductRow {
  sku: string;
  description: string;
  brand: Brand;
  temp_requirement: TempRequirement;
  unit_weight_kg: number;
  unit_volume_m3: number;
}

/** The store's four order categories as brand and temperature. */
const CATEGORY_SQL: Record<ProductCategory, string> = {
  chilled: "(brand = 'Fresh' AND temp_requirement = 'chilled')",
  dry: "(brand = 'Fresh' AND temp_requirement = 'ambient')",
  tech: "(brand = 'Tech')",
  style: "(brand = 'Style')",
};

export const categoryOf = (p: Pick<ProductRow, 'brand' | 'temp_requirement'>): ProductCategory =>
  p.brand === 'Fresh' ? (p.temp_requirement === 'chilled' ? 'chilled' : 'dry') : p.brand === 'Tech' ? 'tech' : 'style';

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listProducts(filter: { categories?: ProductCategory[]; brand?: Brand; search?: string }): Promise<ProductRow[]> {
  const where: string[] = ['active'];
  const params: unknown[] = [];
  if (filter.categories && filter.categories.length > 0) {
    where.push(`(${filter.categories.map((c) => CATEGORY_SQL[c]).join(' OR ')})`);
  }
  if (filter.brand) {
    params.push(filter.brand);
    where.push(`brand = $${params.length}`);
  }
  if (filter.search) {
    params.push(`%${escapeLike(filter.search)}%`);
    where.push(`(description ILIKE $${params.length} OR sku ILIKE $${params.length})`);
  }
  const { rows } = await pool.query(
    `SELECT sku, description, brand, temp_requirement, unit_weight_kg, unit_volume_m3
       FROM products WHERE ${where.join(' AND ')} ORDER BY brand, temp_requirement, description`,
    params,
  );
  return rows.map((r) => ({ ...r, unit_weight_kg: Number(r.unit_weight_kg), unit_volume_m3: Number(r.unit_volume_m3) }));
}
