export type Category = 'chilled' | 'dry' | 'tech' | 'style';
export type Warehouse = 'Peliyagoda' | 'Kandy';
export interface Order {
  id: string; category: Category; warehouse: Warehouse; destination: string;
  date: string; status: 'Delivered' | 'Scheduled' | 'Deferred' | 'Pending' | 'Disputed' | 'Cancelled' | 'Not run';
  reason?: string; items: {id:string;name:string;expected:number}[]; outletId?: string; backendStatus?: string; itemsLoaded?: boolean;
}
export interface Trip {
  id: string; destination: string; category: Category; weight: number; volume: number;
  stops: string[]; departure?: string; returnTime?: string; stopDetails?: { outletId:string;orderRef:string;eta:string;windowOpen:string;windowClose:string }[];
}
export interface Vehicle {
  id: string; warehouse: Warehouse; kind: 'van' | 'truck'; refrigerated: boolean;
  available: boolean; trips: Trip[]; tripsLoaded?: boolean;
  unavailablePeriods?:UnavailablePeriod[]; unavailableUntil?:string;
  weightCapacityKg?:number|null; volumeCapacityM3?:number|null; weeklyFuelQuotaLitres?:number|null;
}
export interface UnavailablePeriod { from:string;to:string }
export interface AvailabilityUpdate { status:'available'|'in_workshop';unavailable_periods:UnavailablePeriod[] }
export interface Incident {
  id: string; source: string; kind: 'driver' | 'warehouse' | 'store';
  summary: string; detail: string; minutesAgo: number; vehicleId?: string; orderId?: string;
}
