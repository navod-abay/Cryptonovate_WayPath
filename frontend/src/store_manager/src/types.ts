export type OrderType = 'chilled' | 'dry';

export interface Outlet {
  id: string;
  city: string;
  managerName: string;
}

export interface Product {
  id: string;
  name: string;
  type: OrderType;
}

export interface OrderLine {
  productId: string;
  name: string;
  quantity: number;
  /** Units carried over from a previous delivery that came up short. */
  carriedOver?: number;
}

export type OrderStatus =
  | 'confirmed'
  | 'scheduled'
  | 'deferred'
  | 'loaded'
  | 'on_the_way'
  | 'delivered';

export interface Order {
  id: string;
  type: OrderType;
  /** ISO date (yyyy-mm-dd) the outlet wants the delivery on. */
  deliveryDate: string;
  status: OrderStatus;
  lines: OrderLine[];
  placedAt: string;
  scheduledAt?: string;
  loadedAt?: string;
  dispatchedAt?: string;
  receivedAt?: string;
  /** Expected arrival, "HH:mm". */
  eta?: string;
  vehicle?: string;
  deferredReason?: string;
}

export type DeliveryStatus = 'on_the_way' | 'arrived' | 'unloading' | 'delivered';

export interface DeliveryItem {
  productId: string;
  name: string;
  ordered: number;
  sent: number;
  received: number;
}

export type IssueKind = 'damaged' | 'missing';

export interface IssueReport {
  id: string;
  deliveryId: string;
  productId: string;
  itemName: string;
  kind: IssueKind;
  reasons: string[];
  quantity: number;
  createdAt: string;
}

export interface RouteStop {
  label: string;
  done: boolean;
}

export interface Delivery {
  id: string;
  orderId: string;
  type: OrderType;
  vehicle: string;
  /** ISO date of the delivery. */
  date: string;
  /** Estimated (or actual) arrival "HH:mm". */
  eta: string;
  window: [string, string];
  status: DeliveryStatus;
  stops: RouteStop[];
  items: DeliveryItem[];
  reports: IssueReport[];
  arrivedAt?: string;
  confirmedAt?: string;
}

export type UpdateSource = 'driver' | 'dispatcher' | 'loader';

export interface Update {
  id: string;
  source: UpdateSource;
  message: string;
  at: string;
  /** In-app route to open when the update is clicked. */
  link?: string;
  read: boolean;
}

export interface ConfirmationCode {
  deliveryId: string;
  code: string;
  expiresAt: string;
}
