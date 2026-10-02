import type { InventoryItem } from '@waypoint/ui';

export type Category = 'chilled' | 'dry' | 'tech' | 'style';
export type Warehouse = 'Peliyagoda' | 'Kandy';
export interface Order {
  id: string; category: Category; warehouse: Warehouse; destination: string;
  date: string; status: 'Delivered' | 'Scheduled' | 'Deferred' | 'Pending';
  reason?: string; items: InventoryItem[];
}
export interface Trip {
  id: string; destination: string; category: Category; weight: number; volume: number;
  stops: string[];
}
export interface Vehicle {
  id: string; warehouse: Warehouse; kind: 'van' | 'truck'; refrigerated: boolean;
  available: boolean; trips: Trip[];
}
export interface Incident {
  id: string; source: string; kind: 'driver' | 'warehouse' | 'store';
  summary: string; detail: string; minutesAgo: number; vehicleId?: string; orderId?: string;
}
