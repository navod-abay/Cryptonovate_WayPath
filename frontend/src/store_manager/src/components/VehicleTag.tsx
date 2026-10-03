import { CATEGORY } from '@/config/categories';
import type { OrderType } from '@/types';

/** "VEH056 🚐" — van for chilled runs, truck for the others. */
export default function VehicleTag({ vehicle, type, size = 22 }: { vehicle: string; type: OrderType; size?: number }) {
  const Icon = CATEGORY[type].vehicleIcon;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 16, fontSize: size, fontWeight: 500 }}>
      {vehicle}
      <Icon size={size + 10} aria-hidden />
    </span>
  );
}
