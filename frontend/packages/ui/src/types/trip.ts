/**
 * @waypoint/ui — Shared trip/inventory types
 *
 * Re-exported from driver_mobile/src/types/Trip.ts so that
 * web frontends can import them alongside the components without
 * depending on the mobile workspace directly.
 */

export interface InventoryItem {
  id: string;
  name: string;
  expected: number;
  actual: number;
}

export interface TripLog {
  action: 'Arrival' | 'Departure';
  time: string;
}

export interface TripNode {
  id: string;
  type: 'warehouse' | 'outlet';
  sequence: number;
  title: string;
  badgeText: string;
  location: string;
  scheduledStart: string;
  scheduledEnd: string;
  estimatedArrival?: string;
  status: 'pending' | 'arrived' | 'ready_to_depart' | 'completed';
  logs: TripLog[];
  inventory: InventoryItem[];
  reportCount?: number;
}

export interface TripPayload {
  activeTripId: string;
  isStarted: boolean;
  nodes: TripNode[];
}
