export type UserRole = 'dispatcher' | 'loader' | 'driver' | 'store_manager';

export interface BaseUser {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  outletId?: string | null;
  depot?: string | null;
}

export interface DeliveryOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  status: 'PENDING' | 'ALLOCATED' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED';
  deliveryWindowStart: string;
  deliveryWindowEnd: string;
}

export interface RouteOptimizationRequest {
  depotId: string;
  orderIds: string[];
  vehicleIds: string[];
}
