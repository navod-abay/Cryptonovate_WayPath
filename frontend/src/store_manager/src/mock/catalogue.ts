import type { OrderType, Product, TruckCapacity } from '@/types';

/**
 * Mock product catalogue (the challenge datasets do not ship one).
 * weightKg / volumeM3 are per unit and will come from the backend later.
 */
export const PRODUCTS: Product[] = [
  { id: 'CH-MILK', name: 'Fresh Milk Crates', type: 'chilled', weightKg: 22, volumeM3: 0.06 },
  { id: 'CH-YOG', name: 'Yoghurt Crates', type: 'chilled', weightKg: 15, volumeM3: 0.05 },
  { id: 'CH-DAIRY', name: 'Dairy Crates', type: 'chilled', weightKg: 18, volumeM3: 0.05 },
  { id: 'CH-CHEESE', name: 'Cheese Boxes', type: 'chilled', weightKg: 10, volumeM3: 0.03 },
  { id: 'CH-BUTTER', name: 'Butter Boxes', type: 'chilled', weightKg: 12, volumeM3: 0.03 },
  { id: 'CH-CHICK', name: 'Chicken Trays', type: 'chilled', weightKg: 12, volumeM3: 0.04 },
  { id: 'CH-FISH', name: 'Fish Trays', type: 'chilled', weightKg: 14, volumeM3: 0.04 },
  { id: 'CH-PROD', name: 'Produce Crates', type: 'chilled', weightKg: 15, volumeM3: 0.08 },
  { id: 'CH-ICE', name: 'Ice Cream Tubs', type: 'chilled', weightKg: 8, volumeM3: 0.04 },
  { id: 'DR-RICE', name: 'Rice Sacks', type: 'dry', weightKg: 25, volumeM3: 0.04 },
  { id: 'DR-DHAL', name: 'Dhal Sacks', type: 'dry', weightKg: 25, volumeM3: 0.035 },
  { id: 'DR-SUGAR', name: 'Sugar Cartons', type: 'dry', weightKg: 20, volumeM3: 0.03 },
  { id: 'DR-FLOUR', name: 'Flour Cartons', type: 'dry', weightKg: 20, volumeM3: 0.03 },
  { id: 'DR-TEA', name: 'Tea Cartons', type: 'dry', weightKg: 12, volumeM3: 0.05 },
  { id: 'DR-BISC', name: 'Biscuit Cartons', type: 'dry', weightKg: 6, volumeM3: 0.06 },
  { id: 'DR-NOOD', name: 'Noodle Cartons', type: 'dry', weightKg: 8, volumeM3: 0.06 },
  { id: 'DR-OIL', name: 'Cooking Oil Cases', type: 'dry', weightKg: 18, volumeM3: 0.025 },
  { id: 'DR-TUNA', name: 'Canned Fish Cases', type: 'dry', weightKg: 15, volumeM3: 0.02 },
  { id: 'DR-CABB', name: 'Cabbage Sacks', type: 'dry', weightKg: 20, volumeM3: 0.07 },
  { id: 'DR-ONION', name: 'Onion Sacks', type: 'dry', weightKg: 25, volumeM3: 0.05 },
  { id: 'TE-PHONE', name: 'Phone Cartons', type: 'tech', weightKg: 8, volumeM3: 0.04 },
  { id: 'TE-LAPTOP', name: 'Laptop Boxes', type: 'tech', weightKg: 12, volumeM3: 0.06 },
  { id: 'TE-TV', name: 'TV Boxes', type: 'tech', weightKg: 20, volumeM3: 0.25 },
  { id: 'TE-AUDIO', name: 'Headphone Cartons', type: 'tech', weightKg: 6, volumeM3: 0.05 },
  { id: 'TE-CONSOLE', name: 'Game Console Boxes', type: 'tech', weightKg: 9, volumeM3: 0.05 },
  { id: 'TE-ACC', name: 'Accessory Crates', type: 'tech', weightKg: 10, volumeM3: 0.06 },
  { id: 'TE-APPL', name: 'Small Appliance Boxes', type: 'tech', weightKg: 14, volumeM3: 0.09 },
  { id: 'ST-TSHIRT', name: 'T-Shirt Bales', type: 'style', weightKg: 15, volumeM3: 0.1 },
  { id: 'ST-JEANS', name: 'Denim Bales', type: 'style', weightKg: 20, volumeM3: 0.12 },
  { id: 'ST-DRESS', name: 'Dress Garment Bags', type: 'style', weightKg: 8, volumeM3: 0.2 },
  { id: 'ST-SHOES', name: 'Shoe Cartons', type: 'style', weightKg: 12, volumeM3: 0.15 },
  { id: 'ST-BAGS', name: 'Handbag Cartons', type: 'style', weightKg: 7, volumeM3: 0.1 },
  { id: 'ST-ACC', name: 'Accessory Cartons', type: 'style', weightKg: 5, volumeM3: 0.05 },
];

export const productById = (id: string) => PRODUCTS.find((p) => p.id === id);

/**
 * Max load per truck, by the order type it carries (chilled = refrigerated van).
 * Mock values; will come from fleet-directory later.
 */
export const TRUCK_CAPACITY: Record<OrderType, TruckCapacity> = {
  chilled: { maxWeightKg: 800, maxVolumeM3: 4 },
  dry: { maxWeightKg: 2000, maxVolumeM3: 10 },
  tech: { maxWeightKg: 1500, maxVolumeM3: 12 },
  style: { maxWeightKg: 1000, maxVolumeM3: 14 },
};
