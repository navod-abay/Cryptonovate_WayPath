export interface InventoryItem {
  id: string;
  name: string;
  expected: number;
  actual: number;
}

export type GoodsType = 'chilled' | 'dry' | 'tech' | 'style';

export interface TripLog {
  action: 'Arrival' | 'Departure';
  time: string;
}

export interface TripNode {
  id: string;
  type: 'warehouse' | 'outlet';
  goodsType?: GoodsType;
  sequence: number;
  title: string;
  badgeText: string;
  location: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: 'pending' | 'arrived' | 'ready_to_depart' | 'completed';
  logs: TripLog[];
  inventory: InventoryItem[];
  reportCount?: number;
  estimatedArrival?: string;
  /** Outlet stops: the planned stop and the order delivered there. */
  stopId?: string;
  orderRef?: string;
}

export interface TripPayload {
  /** Planning's trip id, e.g. 20261005-VEH001-T1. */
  tripId: string;
  vehicleId: string;
  planDate: string;
  /** ready_to_load | loading | completed: whether the loaders have released the truck. */
  loadingStatus: string;
  activeTripId: string; // the tab label, e.g. "Trip 1"
  isStarted: boolean; // Tracks if "Start Trip" was pressed
  nodes: TripNode[];
}

export interface HandoverVerifyRequest {
  code: string;
  completedAt: string;
}

export interface HandoverVerifyResponse {
  success: boolean;
  data: {
    deliveryId: string;
    orderRef: string;
    status: string;
    verifiedAt: string;
  };
}