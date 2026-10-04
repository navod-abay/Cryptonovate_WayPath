import type { Brand, TempRequirement } from '../schemas/orders.schema.js';

/**
 * The product catalogue a store orders from: SKU, name, the brand and temperature it belongs to, and the
 * weight and volume of one unit. Written to the products table on every boot (see seedProducts).
 */
export interface CatalogueProduct {
  sku: string;
  description: string;
  brand: Brand;
  temp: TempRequirement;
  weightKg: number;
  volumeM3: number;
}

export const PRODUCT_CATALOGUE: readonly CatalogueProduct[] = [
  { sku: 'RICE-5KG', description: 'Samba rice 5kg bag', brand: 'Fresh', temp: 'ambient', weightKg: 5.05, volumeM3: 0.007 },
  { sku: 'FLOUR-1KG', description: 'Wheat flour 1kg', brand: 'Fresh', temp: 'ambient', weightKg: 1.02, volumeM3: 0.0014 },
  { sku: 'BISC-CTN', description: 'Biscuit carton (24 packs)', brand: 'Fresh', temp: 'ambient', weightKg: 4.8, volumeM3: 0.028 },
  { sku: 'WATER-1.5LX6', description: 'Bottled water 1.5L x6', brand: 'Fresh', temp: 'ambient', weightKg: 9.3, volumeM3: 0.012 },
  { sku: 'TEA-400G', description: 'Ceylon tea 400g', brand: 'Fresh', temp: 'ambient', weightKg: 0.42, volumeM3: 0.0009 },
  { sku: 'SOAP-CTN', description: 'Soap carton (48 bars)', brand: 'Fresh', temp: 'ambient', weightKg: 5.6, volumeM3: 0.011 },
  { sku: 'BREAD-TRAY', description: 'Bread tray (12 loaves)', brand: 'Fresh', temp: 'ambient', weightKg: 5.2, volumeM3: 0.045 },
  { sku: 'MLK-1L', description: 'Fresh milk 1L', brand: 'Fresh', temp: 'chilled', weightKg: 1.03, volumeM3: 0.0011 },
  { sku: 'YOG-CUP12', description: 'Yoghurt cups (12)', brand: 'Fresh', temp: 'chilled', weightKg: 1.1, volumeM3: 0.0016 },
  { sku: 'CHK-WHOLE', description: 'Whole chicken 1.2kg', brand: 'Fresh', temp: 'chilled', weightKg: 1.25, volumeM3: 0.0025 },
  { sku: 'FISH-TRAY5', description: 'Fresh fish tray 5kg', brand: 'Fresh', temp: 'chilled', weightKg: 5.1, volumeM3: 0.009 },
  { sku: 'BUTTER-CTN', description: 'Butter carton (20 x 200g)', brand: 'Fresh', temp: 'chilled', weightKg: 4.1, volumeM3: 0.0055 },
  { sku: 'VEG-CRATE', description: 'Chilled vegetable crate', brand: 'Fresh', temp: 'chilled', weightKg: 12, volumeM3: 0.045 },
  { sku: 'APP-CTN-S', description: 'Apparel carton (small)', brand: 'Style', temp: 'ambient', weightKg: 6.5, volumeM3: 0.06 },
  { sku: 'APP-CTN-L', description: 'Apparel carton (large)', brand: 'Style', temp: 'ambient', weightKg: 11, volumeM3: 0.12 },
  { sku: 'SHOE-CTN', description: 'Footwear carton (12 pairs)', brand: 'Style', temp: 'ambient', weightKg: 9, volumeM3: 0.08 },
  { sku: 'ACC-BOX', description: 'Accessories box', brand: 'Style', temp: 'ambient', weightKg: 3, volumeM3: 0.025 },
  { sku: 'GOH-RAIL', description: 'Garment-on-hanger rail', brand: 'Style', temp: 'ambient', weightKg: 18, volumeM3: 0.45 },
  { sku: 'TV-55', description: '55" LED TV', brand: 'Tech', temp: 'ambient', weightKg: 18.5, volumeM3: 0.21 },
  { sku: 'FRIDGE-DD', description: 'Double-door refrigerator', brand: 'Tech', temp: 'ambient', weightKg: 62, volumeM3: 0.72 },
  { sku: 'WASH-FL', description: 'Front-load washing machine', brand: 'Tech', temp: 'ambient', weightKg: 70, volumeM3: 0.38 },
  { sku: 'AC-SPLIT', description: 'Split AC unit (indoor + outdoor)', brand: 'Tech', temp: 'ambient', weightKg: 45, volumeM3: 0.3 },
  { sku: 'LAPTOP-CTN5', description: 'Laptop carton (5 units)', brand: 'Tech', temp: 'ambient', weightKg: 12, volumeM3: 0.06 },
];
