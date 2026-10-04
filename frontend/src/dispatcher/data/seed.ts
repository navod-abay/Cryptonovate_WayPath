import type { Category, Incident, Order, Trip, Vehicle } from './types';

// Fixed demo date reproduces the supplied designs, independently of the host clock.
export const DEMO_DATE = '2026-09-28';
export const DEMO_START = new Date('2026-09-28T10:30:00+05:30').getTime();
export const DEMO_REAL_START = Date.now();
export const categories: { id: Category; label: string; delivered: number; total: number; color: string; surface: string; line: string }[] = [
  { id: 'chilled', label: 'Chilled', delivered: 32, total: 37, color: '#80def6', surface: '#ccf2fb', line: '#00bdeb' },
  { id: 'dry', label: 'Dry', delivered: 123, total: 152, color: '#ffe684', surface: '#fffbeb', line: '#ff9900' },
  { id: 'tech', label: 'Tech', delivered: 3, total: 7, color: '#b4f8d0', surface: '#effcf4', line: '#19ca58' },
  { id: 'style', label: 'Style', delivered: 26, total: 31, color: '#ffbfcb', surface: '#fff5f7', line: '#ff5d7d' },
];
const inventory = (category: Category) => {
  const names = category === 'chilled' ? ['Yoghurt Crates', 'Diary Crates', 'Fresh Milk Crates']
    : category === 'dry' ? ['Carrot Sacks', 'Cabbage Sacks', 'Rice Bags']
    : category === 'tech' ? ['Game Controllers', 'Headphones', 'Charging Cables']
    : ['T-shirt Boxes', 'Shirt Boxes', 'Trouser Boxes'];
  return names.map((name, i) => ({ id: `${category}-${i}`, name, expected: [4, 7, 6][i], actual: [4, 7, 6][i] }));
};
export const orders: Order[] = [
  ...(['dry', 'tech', 'style', 'chilled', 'dry', 'style', 'chilled', 'tech', 'dry', 'chilled', 'dry', 'style'] as Category[]).map((category, i): Order => ({
    id: ['OUT001', 'OUT031', 'OUT012', 'OUT006', 'OUT017', 'OUT009', 'OUT021', 'OUT025', 'OUT032', 'OUT041', 'OUT043', 'OUT048'][i],
    category, warehouse: 'Peliyagoda', destination: ['Gampaha', 'Colombo', 'Galle'][i % 3],
    date: DEMO_DATE, status: 'Deferred', reason: i === 3 ? 'Served last order' : 'Skipped last order', items: inventory(category),
  })),
  ...Array.from({ length: 12 }, (_, i): Order => ({
    id: `OUT${String(50 + i).padStart(3, '0')}`, category: categories[i % 4].id,
    warehouse: i % 3 === 0 ? 'Kandy' : 'Peliyagoda', destination: ['Gampaha', 'Kalutara', 'Galle', 'Colombo'][i % 4],
    date: DEMO_DATE, status: i < 8 ? 'Delivered' : 'Scheduled', items: inventory(categories[i % 4].id),
  })),
  ...Array.from({ length: 18 }, (_, i): Order => ({
    id: `OUT${String(70 + i).padStart(3, '0')}`, category: categories[i % 4].id,
    warehouse: i % 3 === 0 ? 'Kandy' : 'Peliyagoda', destination: ['Colombo', 'Gampaha', 'Kandy'][i % 3],
    date: `2026-09-${29 + Math.floor(i / 9)}`, status: 'Pending', items: inventory(categories[i % 4].id),
  })),
];
const trip = (id: string, destination: string, category: Category, weight: number, volume: number, count = 2): Trip => ({
  id, destination, category, weight, volume,
  stops: Array.from({ length: count }, (_, i) => `${destination} ${i === 0 ? 'Central' : i === 1 ? 'North' : 'South'} Outlet`),
});
export const vehicles: Vehicle[] = [
  { id: 'VEH001', warehouse: 'Peliyagoda', kind: 'van', refrigerated: true, available: true, trips: [trip('t1', 'Gampaha', 'chilled', 500, 7), trip('t2', 'Gampaha', 'tech', 500, 7)] },
  { id: 'VEH002', warehouse: 'Peliyagoda', kind: 'truck', refrigerated: false, available: true, trips: [trip('t3', 'Kalutara', 'dry', 670, 20)] },
  { id: 'VEH003', warehouse: 'Peliyagoda', kind: 'van', refrigerated: false, available: true, trips: [trip('t4', 'Galle', 'dry', 720, 7, 3)] },
  { id: 'VEH004', warehouse: 'Peliyagoda', kind: 'van', refrigerated: false, available: true, trips: [trip('t5', 'Colombo', 'dry', 780, 7.2, 3)] },
  { id: 'VEH012', warehouse: 'Peliyagoda', kind: 'truck', refrigerated: true, available: true, trips: [trip('t6', 'Colombo', 'chilled', 2200, 25), trip('t7', 'Gampaha', 'style', 500, 7)] },
  { id: 'VEH018', warehouse: 'Peliyagoda', kind: 'van', refrigerated: false, available: true, trips: [trip('t8', 'Gampaha', 'dry', 810, 6)] },
  { id: 'VEH023', warehouse: 'Kandy', kind: 'truck', refrigerated: false, available: false, trips: [] },
  { id: 'VEH034', warehouse: 'Kandy', kind: 'van', refrigerated: true, available: true, trips: [trip('t9', 'Kandy', 'chilled', 550, 8)] },
];
export const incidents: Incident[] = [
  { id: 'a1', source: 'VEH034', kind: 'driver', summary: 'Road is blocked !...', detail: 'The driver reports a blocked road on the Kandy route. Delivery arrival times may be delayed.', minutesAgo: 5, vehicleId: 'VEH034' },
  { id: 'a2', source: 'VEH002', kind: 'driver', summary: 'unavailable tomor...', detail: 'VEH002 will be unavailable tomorrow due to maintenance.', minutesAgo: 10, vehicleId: 'VEH002' },
  { id: 'a3', source: 'Kandy', kind: 'warehouse', summary: '2 fresh milk crate...', detail: '2 fresh milk crates were reported missing at Kandy warehouse.', minutesAgo: 120 },
  { id: 'a4', source: 'Peliyagoda', kind: 'warehouse', summary: '1 cabbage sack w...', detail: '1 cabbage sack was reported damaged at Peliyagoda warehouse.', minutesAgo: 180 },
  { id: 'a5', source: 'VEH023', kind: 'driver', summary: 'Unavailable tom...', detail: 'VEH023 is unavailable for the next delivery day.', minutesAgo: 240, vehicleId: 'VEH023' },
  { id: 'a6', source: 'OUT003', kind: 'store', summary: 'Damaged items !', detail: 'The store reported damaged items during unloading. The incident is awaiting review.', minutesAgo: 300 },
  { id: 'a7', source: 'OUT039', kind: 'store', summary: 'Damaged items !', detail: 'OUT039 reported damaged items on its latest delivery.', minutesAgo: 360 },
  { id: 'a8', source: 'VEH003', kind: 'driver', summary: 'Unavailable tom...', detail: 'VEH003 will be unavailable tomorrow.', minutesAgo: 360, vehicleId: 'VEH003' },
];
