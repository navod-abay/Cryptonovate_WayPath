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
}

export interface TripPayload {
  activeTripId: string;
  isStarted: boolean; // Tracks if "Start Trip" was pressed
  nodes: TripNode[];
}