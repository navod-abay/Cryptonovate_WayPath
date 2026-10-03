import type { ReactNode } from 'react';
import { Badge, CarrotIcon, COLORS } from '@waypoint/ui';
import { Gamepad2, Shirt, Snowflake, Truck, Bus } from 'lucide-react';
import { categories } from '../data/presentation';
import type { Category, Vehicle } from '../data/types';

export function CategoryIcon({ category, small = false }: { category: Category; small?: boolean }) {
  const Icon = category === 'chilled' ? Snowflake : category === 'tech' ? Gamepad2 : category === 'style' ? Shirt : CarrotIcon;
  return <Badge className={`category-icon${small ? ' small' : ''}`} backgroundColor={categories.find(c => c.id === category)!.color} textColor={COLORS.primaryDark} icon={<Icon width={small ? 24 : 34} height={small ? 24 : 34} />} />;
}
export function VehicleIcon({ vehicle }: { vehicle: Vehicle }) {
  const Icon = vehicle.kind === 'truck' ? Truck : Bus;
  return <span className="vehicle-icon"><Icon size={27} strokeWidth={1.5} /></span>;
}
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{children}</section>;
}
export function EmptyState({ text = 'No orders match your filters.' }: { text?: string }) {
  return <p className="empty-state" role="status">{text}</p>;
}
export function formatDate(date: string, withYear = false) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'Asia/Colombo' }).format(new Date(`${date}T12:00:00+05:30`));
}
export function isValidDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
