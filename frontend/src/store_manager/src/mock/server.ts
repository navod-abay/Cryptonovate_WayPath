/**
 * In-memory fake backend used while VITE_USE_MOCK_API is not "false".
 *
 * Each function here stands in for one HTTP endpoint and returns the same JSON
 * the real endpoint should return (see BACKEND_INTEGRATION.md). Data lives in
 * memory per outlet and resets when the page reloads.
 */
import { ApiError } from '@/api/http';
import type {
  ConfirmationCode, Delivery, IssueReport, LoginResponse, NewIssueInput, NewOrderInput,
  Order, OrderSuggestions, OrderType, Outlet, Product, TruckCapacity, Update, User,
} from '@/types';
import { createSeed, type SeedState } from './seed';
import { MOCK_ACCOUNTS } from './users';
import { PRODUCTS, TRUCK_CAPACITY } from './catalogue';
import { now } from './clock';
import { CATEGORY } from '@/config/categories';
import { formatClock } from '@/utils/date';

const latency = (ms = 300) => new Promise((r) => setTimeout(r, ms));
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** Mock "who is logged in" (the real backend reads this from the JWT). */
let currentUsername: string | null = null;
const dbs = new Map<string, SeedState>();
/** deliveryId -> time the handover code was issued (mock: driver "enters" it 8 s later). */
const issuedCodes = new Map<string, number>();
const DRIVER_ENTERS_CODE_AFTER_MS = 8000;

const MOCK_PLAN: Record<OrderType, { eta: string; vehicle: string }> = {
  chilled: { eta: '09:12', vehicle: 'VEH056' },
  dry: { eta: '10:40', vehicle: 'VEH003' },
  tech: { eta: '09:40', vehicle: 'VEH071' },
  style: { eta: '11:10', vehicle: 'VEH088' },
};

function account() {
  const a = MOCK_ACCOUNTS.find((x) => x.user.username === currentUsername);
  if (!a) throw new ApiError('Not authenticated', 401);
  return a;
}
function db(): SeedState {
  const { outlet } = account();
  if (!dbs.has(outlet.id)) dbs.set(outlet.id, createSeed(outlet));
  return dbs.get(outlet.id)!;
}
function delivery(id: string) {
  const d = db().deliveries.find((x) => x.id === id);
  if (!d) throw new ApiError('Delivery not found', 404);
  return d;
}

/** Called on page load when a saved session exists (the real backend just validates the JWT). */
export function resumeSession(username: string) {
  currentUsername = username;
}

// ---------- auth-rbac ----------

export async function login(username: string, password: string): Promise<LoginResponse> {
  await latency(500);
  const a = MOCK_ACCOUNTS.find((x) => x.user.username.toLowerCase() === username.trim().toLowerCase());
  if (!a || a.password !== password) throw new ApiError('Invalid username or password', 401);
  currentUsername = a.user.username;
  return {
    access_token: `mock.${btoa(a.user.username)}.${Date.now()}`,
    refresh_token: `mock-refresh.${Date.now()}`,
    user: { id: a.user.id, username: a.user.username, role: a.user.role, fullName: a.user.fullName, outletId: a.user.outletId, depot: null },
  };
}

export async function me(): Promise<User> {
  await latency(150);
  return clone(account().user);
}

export async function changePassword(current: string, next: string): Promise<void> {
  await latency(400);
  const a = account();
  if (a.password !== current) throw new ApiError('Current password is incorrect.', 400);
  a.password = next;
}

export function logout() {
  currentUsername = null;
}

// ---------- outlet / catalogue / fleet ----------

export async function getOutlet(outletId: string): Promise<Outlet> {
  await latency(150);
  const a = MOCK_ACCOUNTS.find((x) => x.outlet.id.toLowerCase() === outletId.toLowerCase());
  if (a) return clone(a.outlet);
  return {
    id: outletId,
    city: 'Colombo',
    managerName: 'Store Manager',
    storeName: `Waypoint Store – ${outletId}`,
    storeType: 'grocery',
    categories: ['chilled', 'dry'],
    address: 'Commercial Center, Colombo 01',
  };
}

export async function getProducts(categories: OrderType[]): Promise<Product[]> {
  await latency(200);
  return clone(PRODUCTS.filter((p) => categories.includes(p.type)));
}

export async function getTruckCapacity(categories: OrderType[]): Promise<Partial<Record<OrderType, TruckCapacity>>> {
  await latency(150);
  return Object.fromEntries(categories.map((c) => [c, TRUCK_CAPACITY[c]]));
}

// ---------- order-management ----------

export async function getOrders(): Promise<Order[]> {
  await latency(250);
  return clone(db().orders);
}

export async function getOrderSuggestions(): Promise<OrderSuggestions> {
  await latency(150);
  const d = db();
  return clone({ lastOrderQty: d.lastOrderQty, missingFromLast: d.missingFromLast });
}

export async function placeOrder(input: NewOrderInput): Promise<Order> {
  await latency(350);
  const d = db();
  const placedAt = now();
  const order: Order = {
    id: `ORD-${d.outlet.id}-${CATEGORY[input.type].code}-${Math.floor(1000 + Math.random() * 8999)}`,
    type: input.type,
    deliveryDate: input.deliveryDate,
    status: 'scheduled',
    lines: input.lines.filter((l) => l.quantity + (l.carriedOver ?? 0) > 0),
    placedAt: placedAt.toISOString(),
    scheduledAt: new Date(placedAt.getTime() + 2 * 3600_000).toISOString(),
    ...MOCK_PLAN[input.type],
  };
  d.orders = [...d.orders.filter((o) => !(o.type === order.type && o.deliveryDate === order.deliveryDate)), order];
  d.missingFromLast = { ...d.missingFromLast, [input.type]: [] };
  return clone(order);
}

export async function dismissCarryOver(type: OrderType, productId: string): Promise<void> {
  await latency(150);
  const d = db();
  d.missingFromLast = { ...d.missingFromLast, [type]: d.missingFromLast[type].filter((l) => l.productId !== productId) };
}

// ---------- execution-sync ----------

export async function getDeliveries(): Promise<Delivery[]> {
  await latency(250);
  return clone(db().deliveries);
}

export async function getDelivery(id: string): Promise<Delivery> {
  await latency(150);
  const d = delivery(id);
  const issued = issuedCodes.get(id);
  if (issued && d.status !== 'delivered' && Date.now() - issued >= DRIVER_ENTERS_CODE_AFTER_MS) completeHandover(d);
  return clone(d);
}

export async function startUnloading(id: string): Promise<Delivery> {
  await latency(200);
  const d = delivery(id);
  if (d.status === 'arrived') d.status = 'unloading';
  return clone(d);
}

export async function createDispute(deliveryId: string, input: NewIssueInput): Promise<IssueReport> {
  await latency(250);
  const d = delivery(deliveryId);
  const item = d.items.find((i) => i.productId === input.productId);
  const report: IssueReport = { id: uid('REP'), deliveryId, itemName: item?.name ?? input.productId, createdAt: now().toISOString(), ...input };
  d.reports.push(report);
  return clone(report);
}

export async function deleteDispute(deliveryId: string, reportId: string): Promise<void> {
  await latency(150);
  const d = delivery(deliveryId);
  d.reports = d.reports.filter((r) => r.id !== reportId);
}

export async function reportDeliveryProblem(deliveryId: string, problems: string[]): Promise<{ id: string }> {
  await latency(300);
  delivery(deliveryId);
  void problems;
  return { id: uid('PRB') };
}

export async function createHandoverCode(deliveryId: string): Promise<ConfirmationCode> {
  await latency(300);
  delivery(deliveryId);
  issuedCodes.set(deliveryId, Date.now());
  return { deliveryId, code: String(Math.floor(100000 + Math.random() * 900000)), expiresAt: new Date(now().getTime() + 112_000).toISOString() };
}

function completeHandover(d: Delivery) {
  const at = now().toISOString();
  const s = db();
  d.status = 'delivered';
  d.confirmedAt = at;
  s.orders = s.orders.map((o) => (o.id === d.orderId ? { ...o, status: 'delivered', receivedAt: at } : o));
  const n = d.reports.length;
  s.updates = [
    {
      id: uid('U'), source: 'driver', read: false, at, link: `/deliveries/${d.id}/receive`,
      message: `${d.vehicle} delivery confirmed at ${formatClock(new Date(at))}${n ? ` with ${n} issue${n > 1 ? 's' : ''}` : ''} !`,
    },
    ...s.updates,
  ];
  issuedCodes.delete(d.id);
}

// ---------- notifications ----------

export async function getUpdates(): Promise<Update[]> {
  await latency(200);
  return clone(db().updates);
}

export async function markUpdatesRead(ids: string[]): Promise<void> {
  await latency(100);
  const s = db();
  s.updates = s.updates.map((u) => (ids.includes(u.id) ? { ...u, read: true } : u));
}
