/** Order category. A store orders one or more of these (grocery: chilled + dry, tech: tech, style: style). */
export type OrderType = 'chilled' | 'dry' | 'tech' | 'style';

export type StoreType = 'grocery' | 'tech' | 'style';

export interface Outlet {
  id: string;
  city: string;
  /** First name used in the greeting. */
  managerName: string;
  storeName: string;
  storeType: StoreType;
  /** Order categories this store receives; decides the icons and order screens shown. */
  categories: OrderType[];
  address: string;
}

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: 'store_manager';
  outletId: string;
  /** Optional profile fields (shown as "–" when the backend doesn't send them). */
  email?: string;
  phone?: string;
  /** ISO date the account was created. */
  memberSince?: string;
}

export interface Session {
  /** JWT access token, sent as "Authorization: Bearer <token>". */
  token: string;
  refreshToken?: string;
  user: User;
  outlet: Outlet;
}

/** Shape of POST /auth/login today (auth-rbac). */
export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: { id: string; username: string; role: string; fullName: string; outletId: string | null; depot?: string | null };
}

/** "Last order" quantities and units owed from the last delivery, used by the order page. */
export interface OrderSuggestions {
  lastOrderQty: Record<string, number>;
  missingFromLast: Partial<Record<OrderType, OrderLine[]>>;
}

export interface NewOrderInput {
  type: OrderType;
  /** yyyy-mm-dd */
  deliveryDate: string;
  lines: OrderLine[];
}

export interface NewIssueInput {
  productId: string;
  kind: IssueKind;
  reasons: string[];
  quantity: number;
}

export interface Product {
  id: string;
  name: string;
  type: OrderType;
  /** Weight of one unit (crate, tray, sack...) in kg. */
  weightKg: number;
  /** Volume of one unit in cubic metres. */
  volumeM3: number;
}

/** Maximum load of the vehicle that carries one order type. */
export interface TruckCapacity {
  maxWeightKg: number;
  maxVolumeM3: number;
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
  /** Receipt finished on this device, waiting for the driver's delivery proof to reach the server. */
  receiptQueued?: boolean;
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
  /** Reached the server long after it happened (queued on the driver's phone while offline). */
  syncedLate?: boolean;
}

export interface ConfirmationCode {
  deliveryId: string;
  code: string;
  expiresAt: string;
}
