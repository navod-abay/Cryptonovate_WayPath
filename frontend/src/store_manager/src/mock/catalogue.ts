import type { Product } from '@/types';

/** Mock product catalogue (the challenge datasets do not ship one). */
export const PRODUCTS: Product[] = [
  { id: 'CH-MILK', name: 'Fresh Milk Crates', type: 'chilled' },
  { id: 'CH-YOG', name: 'Yoghurt Crates', type: 'chilled' },
  { id: 'CH-DAIRY', name: 'Dairy Crates', type: 'chilled' },
  { id: 'CH-CHEESE', name: 'Cheese Boxes', type: 'chilled' },
  { id: 'CH-BUTTER', name: 'Butter Boxes', type: 'chilled' },
  { id: 'CH-CHICK', name: 'Chicken Trays', type: 'chilled' },
  { id: 'CH-FISH', name: 'Fish Trays', type: 'chilled' },
  { id: 'CH-PROD', name: 'Produce Crates', type: 'chilled' },
  { id: 'CH-ICE', name: 'Ice Cream Tubs', type: 'chilled' },
  { id: 'DR-RICE', name: 'Rice Sacks', type: 'dry' },
  { id: 'DR-DHAL', name: 'Dhal Sacks', type: 'dry' },
  { id: 'DR-SUGAR', name: 'Sugar Cartons', type: 'dry' },
  { id: 'DR-FLOUR', name: 'Flour Cartons', type: 'dry' },
  { id: 'DR-TEA', name: 'Tea Cartons', type: 'dry' },
  { id: 'DR-BISC', name: 'Biscuit Cartons', type: 'dry' },
  { id: 'DR-NOOD', name: 'Noodle Cartons', type: 'dry' },
  { id: 'DR-OIL', name: 'Cooking Oil Cases', type: 'dry' },
  { id: 'DR-TUNA', name: 'Canned Fish Cases', type: 'dry' },
  { id: 'DR-CABB', name: 'Cabbage Sacks', type: 'dry' },
  { id: 'DR-ONION', name: 'Onion Sacks', type: 'dry' },
];

export const productById = (id: string) => PRODUCTS.find((p) => p.id === id);
