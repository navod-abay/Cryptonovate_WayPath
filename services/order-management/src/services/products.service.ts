import { appError } from '../domain/errors.js';
import type { Actor } from '../middleware/outletScope.js';
import { categoryOf, listProducts as listProductsRepo, type ProductCategory } from '../repositories/products.repo.js';
import { resolveOutlet } from './referenceData.js';

/**
 * Products an actor may order from. A store manager only sees their own outlet's brand, so a Tech
 * store never sees grocery lines; dispatchers see everything the filters allow.
 */
export async function listProducts(actor: Actor, query: { categories?: ProductCategory[]; search?: string }) {
  let brand;
  if (actor.role === 'store_manager') {
    if (!actor.outletId) throw appError('OUTLET_SCOPE_VIOLATION', 'Store manager account is not linked to an outlet');
    const outlet = await resolveOutlet(actor.outletId);
    if (!outlet) throw appError('OUTLET_SCOPE_VIOLATION', `Outlet ${actor.outletId} is not known`);
    brand = outlet.brand;
  }
  const rows = await listProductsRepo({ categories: query.categories, brand, search: query.search?.trim() || undefined });
  return rows.map((p) => ({ ...p, category: categoryOf(p), is_chilled: p.temp_requirement === 'chilled' }));
}
