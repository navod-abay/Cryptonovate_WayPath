import type { Product, TruckCapacity } from '@/types';

export interface LoadLine {
  product: Product;
  /** Units on the order, including units carried over from last time. */
  units: number;
}

export const loadOf = (lines: LoadLine[]) =>
  lines.reduce(
    (t, l) => ({ weightKg: t.weightKg + l.units * l.product.weightKg, volumeM3: t.volumeM3 + l.units * l.product.volumeM3 }),
    { weightKg: 0, volumeM3: 0 },
  );

/** How many more units of `product` fit in the truck, given what is already on the order. */
export function unitsThatFit(product: Product, current: { weightKg: number; volumeM3: number }, cap: TruckCapacity) {
  const eps = 1e-9; // float safety
  const byWeight = Math.floor((cap.maxWeightKg - current.weightKg + eps) / product.weightKg);
  const byVolume = Math.floor((cap.maxVolumeM3 - current.volumeM3 + eps) / product.volumeM3);
  return Math.max(0, Math.min(byWeight, byVolume));
}

/** Which limit decides how many units of `product` fit: the one that allows fewer. */
export function bindingLimit(product: Product, current: { weightKg: number; volumeM3: number }, cap: TruckCapacity) {
  const byWeight = (cap.maxWeightKg - current.weightKg) / product.weightKg;
  const byVolume = (cap.maxVolumeM3 - current.volumeM3) / product.volumeM3;
  return byWeight <= byVolume ? ('weight' as const) : ('volume' as const);
}

/** Which limit stops another unit: 'weight', 'volume', or null if it fits. */
export function limitingFactor(product: Product, current: { weightKg: number; volumeM3: number }, cap: TruckCapacity) {
  const eps = 1e-9;
  if (current.weightKg + product.weightKg > cap.maxWeightKg + eps) return 'weight' as const;
  if (current.volumeM3 + product.volumeM3 > cap.maxVolumeM3 + eps) return 'volume' as const;
  return null;
}

export const formatKg = (kg: number) => `${kg.toLocaleString('en-US', { maximumFractionDigits: 1 })} kg`;
export const formatM3 = (m3: number) => `${m3.toFixed(2)} m³`;
