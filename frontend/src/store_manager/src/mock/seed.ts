import type { Delivery, DeliveryItem, Order, OrderLine, OrderType, Outlet, Update } from '@/types';
import { now } from './clock';
import { PRODUCTS, productById } from './catalogue';
import { CATEGORY } from '@/config/categories';
import { unitName } from '@/utils/text';
import { addDays, nextDeliveryDate, startOfDay, toISODate } from '@/utils/date';

export interface SeedState {
  outlet: Outlet;
  orders: Order[];
  deliveries: Delivery[];
  updates: Update[];
  /** Quantities from the previous order of each product ("Last Order" column). */
  lastOrderQty: Record<string, number>;
  /** Units that came up short last time and can be re-requested. */
  missingFromLast: Record<OrderType, OrderLine[]>;
}

const line = (productId: string, quantity: number, carriedOver?: number): OrderLine => ({
  productId,
  name: productById(productId)?.name ?? productId,
  quantity,
  ...(carriedOver ? { carriedOver } : {}),
});

const at = (base: Date, hh: number, mm: number) => {
  const d = new Date(base);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
};

const hoursAgo = (h: number) => new Date(now().getTime() - h * 3600_000).toISOString();
const daysAgo = (d: number, hh = 10) => at(addDays(startOfDay(now()), -d), hh, 0);

const noMissing = (): Record<OrderType, OrderLine[]> => ({ chilled: [], dry: [], tech: [], style: [] });

/** Mock data for the logged-in store. Grocery stores get the Figma scenario; tech/style get a generated one. */
export function createSeed(outlet: Outlet): SeedState {
  return outlet.storeType === 'grocery' ? createGrocerySeed(outlet) : createSingleCategorySeed(outlet, outlet.categories[0]);
}

function createGrocerySeed(outlet: Outlet): SeedState {
  const today = startOfDay(now());
  const todayISO = toISODate(today);
  const next = nextDeliveryDate(now());
  const nextISO = toISODate(next);
  const yesterday = addDays(today, -1);

  const orders: Order[] = [
    // Today's deliveries
    {
      id: 'ORD-OUT015-C-0412',
      type: 'chilled',
      deliveryDate: todayISO,
      status: 'on_the_way',
      lines: [line('CH-YOG', 4), line('CH-DAIRY', 7), line('CH-MILK', 6), line('CH-CHICK', 10), line('CH-FISH', 9)],
      placedAt: at(yesterday, 13, 41),
      scheduledAt: at(yesterday, 17, 41),
      loadedAt: at(today, 5, 30),
      dispatchedAt: at(today, 6, 10),
      eta: '08:15',
      vehicle: 'VEH056',
    },
    {
      id: 'ORD-OUT015-D-0413',
      type: 'dry',
      deliveryDate: todayISO,
      status: 'on_the_way',
      lines: [line('DR-RICE', 6), line('DR-DHAL', 4), line('DR-SUGAR', 8), line('DR-FLOUR', 6), line('DR-TEA', 4), line('DR-BISC', 5)],
      placedAt: at(yesterday, 11, 5),
      scheduledAt: at(yesterday, 17, 41),
      loadedAt: at(today, 7, 10),
      dispatchedAt: at(today, 8, 0),
      eta: '10:05',
      vehicle: 'VEH003',
    },
    // Next delivery day: dry already placed, chilled not placed yet
    {
      id: 'ORD-OUT015-D-0420',
      type: 'dry',
      deliveryDate: nextISO,
      status: 'confirmed',
      lines: [line('DR-RICE', 4), line('DR-SUGAR', 6, 1), line('DR-FLOUR', 5, 1), line('DR-TEA', 8), line('DR-NOOD', 8)],
      placedAt: hoursAgo(3),
    },
    // An older deferred chilled order (opened from Recent Updates)
    {
      id: 'ORD-OUT015-C-0398',
      type: 'chilled',
      deliveryDate: toISODate(addDays(today, -1)),
      status: 'deferred',
      lines: [line('CH-YOG', 1), line('CH-DAIRY', 3), line('CH-MILK', 2), line('CH-CHICK', 2)],
      placedAt: daysAgo(2, 15),
      scheduledAt: daysAgo(2, 17),
      deferredReason:
        'Refrigerated trucks are full ahead of the festival. Outlets that missed a delivery this week go first, and you were served today.',
    },
  ];

  const deliveries: Delivery[] = [
    {
      id: 'DEL-0412',
      orderId: 'ORD-OUT015-C-0412',
      type: 'chilled',
      vehicle: 'VEH056',
      date: todayISO,
      eta: '08:15',
      window: ['08:00', '08:30'],
      status: 'arrived',
      arrivedAt: at(today, 8, 15),
      stops: [
        { label: 'Warehouse', done: true },
        { label: 'Outlet 1', done: true },
      ],
      items: [
        { productId: 'CH-YOG', name: 'Yoghurt Crates', ordered: 4, sent: 4, received: 4 },
        { productId: 'CH-DAIRY', name: 'Dairy Crates', ordered: 7, sent: 7, received: 7 },
        { productId: 'CH-MILK', name: 'Fresh Milk Crates', ordered: 6, sent: 6, received: 6 },
        { productId: 'CH-CHICK', name: 'Chicken Trays', ordered: 10, sent: 9, received: 9 },
        { productId: 'CH-FISH', name: 'Fish Trays', ordered: 9, sent: 8, received: 8 },
      ],
      reports: [],
    },
    {
      id: 'DEL-0413',
      orderId: 'ORD-OUT015-D-0413',
      type: 'dry',
      vehicle: 'VEH003',
      date: todayISO,
      eta: '10:05',
      window: ['09:50', '10:20'],
      status: 'on_the_way',
      stops: [
        { label: 'Warehouse', done: true },
        { label: 'Outlet 1', done: false },
      ],
      items: [
        { productId: 'DR-RICE', name: 'Rice Sacks', ordered: 6, sent: 6, received: 6 },
        { productId: 'DR-DHAL', name: 'Dhal Sacks', ordered: 4, sent: 4, received: 4 },
        { productId: 'DR-SUGAR', name: 'Sugar Cartons', ordered: 8, sent: 7, received: 7 },
        { productId: 'DR-FLOUR', name: 'Flour Cartons', ordered: 6, sent: 5, received: 5 },
        { productId: 'DR-TEA', name: 'Tea Cartons', ordered: 4, sent: 4, received: 4 },
        { productId: 'DR-BISC', name: 'Biscuit Cartons', ordered: 5, sent: 5, received: 5 },
      ],
      reports: [],
    },
  ];

  // A few finished deliveries for the "Past" list.
  const pastDays = [1, 2, 3, 5].map((n) => addDays(today, -n)).filter((d) => d.getDay() !== 0);
  pastDays.forEach((d, i) => {
    const iso = toISODate(d);
    const type = i % 2 === 0 ? 'dry' : 'chilled';
    const id = `DEL-P${i + 1}`;
    const items = type === 'dry'
      ? [
          { productId: 'DR-RICE', name: 'Rice Sacks', ordered: 6, sent: 6, received: 6 },
          { productId: 'DR-CABB', name: 'Cabbage Sacks', ordered: 4, sent: 3, received: 3 },
          { productId: 'DR-TEA', name: 'Tea Cartons', ordered: 4, sent: 4, received: 4 },
        ]
      : [
          { productId: 'CH-MILK', name: 'Fresh Milk Crates', ordered: 6, sent: 4, received: 4 },
          { productId: 'CH-YOG', name: 'Yoghurt Crates', ordered: 5, sent: 5, received: 5 },
        ];
    orders.push({
      id: `ORD-OUT015-P${i + 1}`, type, deliveryDate: iso, status: 'delivered',
      lines: items.map((it) => line(it.productId, it.ordered)),
      placedAt: at(addDays(d, -1), 12, 0), scheduledAt: at(addDays(d, -1), 17, 0),
      loadedAt: at(d, 6, 0), dispatchedAt: at(d, 6, 40), receivedAt: at(d, 9, 5),
      eta: '08:50', vehicle: type === 'dry' ? 'VEH003' : 'VEH056',
    });
    deliveries.push({
      id, orderId: `ORD-OUT015-P${i + 1}`, type, vehicle: type === 'dry' ? 'VEH003' : 'VEH056',
      date: iso, eta: '08:50', window: ['08:30', '09:00'], status: 'delivered',
      arrivedAt: at(d, 8, 50), confirmedAt: at(d, 9, 5),
      stops: [{ label: 'Warehouse', done: true }, { label: 'Outlet 1', done: true }],
      items,
      reports: i === 0
        ? [{ id: 'REP-P1', deliveryId: id, productId: 'DR-CABB', itemName: 'Cabbage Sacks', kind: 'damaged', reasons: ['Crushed'], quantity: 1, createdAt: at(d, 9, 0) }]
        : [],
    });
  });

  const updates: Update[] = [
    { id: 'U1', source: 'driver', message: 'Road is blocked ! Driver has changed the route.', at: hoursAgo(2), link: '/deliveries/today?d=DEL-0413', read: false },
    { id: 'U2', source: 'dispatcher', message: 'Yesterday deferred order was moved to today !', at: hoursAgo(6), link: '/orders/ORD-OUT015-C-0398', read: true },
    { id: 'U3', source: 'dispatcher', message: 'Chilled order was deferred !', at: daysAgo(1, 18), link: '/orders/ORD-OUT015-C-0398', read: true },
    { id: 'U4', source: 'loader', message: '2 fresh milk crates are missing !', at: daysAgo(4), read: true },
    { id: 'U5', source: 'loader', message: '1 cabbage sack was damaged and removed !', at: daysAgo(8), read: true },
    { id: 'U6', source: 'dispatcher', message: 'Chilled order was deferred !', at: daysAgo(14), read: true },
    { id: 'U7', source: 'dispatcher', message: 'Dry grocery order was deferred !', at: daysAgo(30), read: true },
  ];

  const lastOrderQty: Record<string, number> = {
    'CH-MILK': 4, 'CH-YOG': 5, 'CH-DAIRY': 7, 'CH-PROD': 1, 'CH-CHICK': 12, 'CH-FISH': 9, 'CH-CHEESE': 2,
    'DR-RICE': 6, 'DR-DHAL': 4, 'DR-SUGAR': 8, 'DR-FLOUR': 6, 'DR-TEA': 4, 'DR-BISC': 5, 'DR-NOOD': 6,
  };

  // Short-shipped at loading today: 1 chicken tray + 1 fish tray
  const missingFromLast = { ...noMissing(), chilled: [line('CH-CHICK', 1), line('CH-FISH', 1)] };

  return {
    outlet,
    orders,
    deliveries,
    updates,
    lastOrderQty,
    missingFromLast,
  };
}

/** Generated scenario for a store with a single category (tech or style). */
function createSingleCategorySeed(outlet: Outlet, type: OrderType): SeedState {
  const today = startOfDay(now());
  const todayISO = toISODate(today);
  const yesterday = addDays(today, -1);
  const products = PRODUCTS.filter((p) => p.type === type).slice(0, 5);
  const vehicle = type === 'tech' ? 'VEH071' : 'VEH088';
  const code = CATEGORY[type].code;
  const ref = (n: string) => `ORD-${outlet.id}-${code}-${n}`;
  const label = CATEGORY[type].short;

  const ordered = [6, 4, 3, 8, 5];
  const items: DeliveryItem[] = products.map((p, i) => {
    const sent = i === 1 ? ordered[i] - 1 : ordered[i]; // one unit removed at loading
    return { productId: p.id, name: p.name, ordered: ordered[i], sent, received: sent };
  });
  const short = items[1];

  const orders: Order[] = [
    {
      id: ref('0512'), type, deliveryDate: todayISO, status: 'on_the_way',
      lines: items.map((it) => line(it.productId, it.ordered)),
      placedAt: at(yesterday, 12, 20), scheduledAt: at(yesterday, 17, 30),
      loadedAt: at(today, 6, 45), dispatchedAt: at(today, 7, 30), eta: '09:40', vehicle,
    },
    {
      id: ref('0497'), type, deliveryDate: toISODate(addDays(today, -2)), status: 'deferred',
      lines: items.slice(0, 3).map((it) => line(it.productId, 2)),
      placedAt: at(addDays(today, -3), 14, 5), scheduledAt: at(addDays(today, -3), 17, 10),
      deferredReason: `The ${label.toLowerCase()} trucks were fully booked that day. Your order was moved to the next available run.`,
    },
  ];

  const deliveries: Delivery[] = [
    {
      id: `DEL-${code}0512`, orderId: ref('0512'), type, vehicle, date: todayISO,
      eta: '09:40', window: ['09:30', '10:00'], status: 'arrived', arrivedAt: at(today, 9, 40),
      stops: [{ label: 'Warehouse', done: true }, { label: 'Outlet 1', done: true }],
      items, reports: [],
    },
  ];

  [1, 2, 4].forEach((n, i) => {
    const d = addDays(today, -n);
    if (d.getDay() === 0) return;
    const id = `DEL-${code}P${i + 1}`;
    const pastItems = items.slice(0, 3).map((it) => ({ ...it, ordered: 3, sent: 3, received: 3 }));
    orders.push({
      id: ref(`P${i + 1}`), type, deliveryDate: toISODate(d), status: 'delivered',
      lines: pastItems.map((it) => line(it.productId, it.ordered)),
      placedAt: at(addDays(d, -1), 11, 0), scheduledAt: at(addDays(d, -1), 17, 0),
      loadedAt: at(d, 6, 30), dispatchedAt: at(d, 7, 15), receivedAt: at(d, 9, 50), eta: '09:35', vehicle,
    });
    deliveries.push({
      id, orderId: ref(`P${i + 1}`), type, vehicle, date: toISODate(d), eta: '09:35', window: ['09:30', '10:00'],
      status: 'delivered', arrivedAt: at(d, 9, 35), confirmedAt: at(d, 9, 50),
      stops: [{ label: 'Warehouse', done: true }, { label: 'Outlet 1', done: true }],
      items: pastItems, reports: [],
    });
  });

  const updates: Update[] = [
    { id: 'U1', source: 'driver', message: `${vehicle} has reached your outlet !`, at: hoursAgo(1), link: `/deliveries/today?d=DEL-${code}0512`, read: false },
    { id: 'U2', source: 'loader', message: `1 ${unitName(short.name, 1)} was removed at loading !`, at: hoursAgo(4), read: true },
    { id: 'U3', source: 'dispatcher', message: `${label} order was deferred !`, at: daysAgo(2, 18), link: `/orders/${ref('0497')}`, read: true },
    { id: 'U4', source: 'dispatcher', message: `${label} delivery window moved to 09:30 !`, at: daysAgo(6), read: true },
  ];

  const lastOrderQty = Object.fromEntries(products.map((p, i) => [p.id, ordered[i]]));

  return {
    outlet,
    orders,
    deliveries,
    updates,
    lastOrderQty,
    missingFromLast: { ...noMissing(), [type]: [line(short.productId, 1)] },
  };
}
