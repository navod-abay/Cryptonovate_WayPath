import type { OrderType } from '@/types';

export const ORDER_CUTOFF_HOUR = 16; // orders close 4:00 PM the day before delivery

export const pad2 = (n: number) => String(n).padStart(2, '0');

export const toISODate = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const fromISODate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (d: Date, days: number) => {
  const c = new Date(d);
  c.setDate(c.getDate() + days);
  return c;
};

export const startOfDay = (d: Date) => {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
};

/** Outlets receive deliveries Monday to Saturday. */
export const isDeliveryDay = (d: Date) => d.getDay() !== 0;

export const nextDeliveryDate = (from: Date) => {
  let d = addDays(startOfDay(from), 1);
  while (!isDeliveryDay(d)) d = addDays(d, 1);
  return d;
};

/** The order for a delivery date closes at 4 PM the previous day. */
export const orderCutoff = (deliveryDate: Date) => {
  const c = addDays(startOfDay(deliveryDate), -1);
  c.setHours(ORDER_CUTOFF_HOUR, 0, 0, 0);
  return c;
};

/** Next delivery date whose order window is still open. */
export const nextOpenDeliveryDate = (now: Date) => {
  let d = nextDeliveryDate(now);
  while (orderCutoff(d) <= now) d = nextDeliveryDate(d);
  return d;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const weekdayShort = (d: Date) => WEEKDAYS[d.getDay()];
export const weekdayLong = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'long' });
export const monthShort = (d: Date) => MONTHS[d.getMonth()];

/** "Mon, 28 Sep" */
export const formatDayMonth = (d: Date) => `${weekdayShort(d)}, ${d.getDate()} ${monthShort(d)}`;

/** "28 Sep, 2026" */
export const formatLongDate = (d: Date) => `${d.getDate()} ${monthShort(d)}, ${d.getFullYear()}`;

/** "08:15" -> "8:15 AM" */
export const formatHHmm = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${pad2(m)} ${suffix}`;
};

/** Date -> "03:41 PM" */
export const formatClock = (d: Date) => {
  const h = d.getHours();
  return `${pad2(((h + 11) % 12) + 1)}:${pad2(d.getMinutes())} ${h >= 12 ? 'PM' : 'AM'}`;
};

export const greeting = (d: Date) => {
  const h = d.getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
};

/** "2hrs ago", "Yesterday", "01, Sep" — matches the Recent Updates list. */
export const relativeTime = (iso: string, now: Date) => {
  const t = new Date(iso);
  const mins = Math.round((now.getTime() - t.getTime()) / 60000);
  if (mins < 1) return 'Now';
  if (mins < 60) return `${mins}min${mins === 1 ? '' : 's'} ago`;
  const days = Math.round((startOfDay(now).getTime() - startOfDay(t).getTime()) / 86400000);
  if (days === 0) {
    const hrs = Math.floor(mins / 60);
    return `${hrs}hr${hrs === 1 ? '' : 's'} ago`;
  }
  if (days === 1) return 'Yesterday';
  return `${pad2(t.getDate())}, ${monthShort(t)}`;
};

/** Split a duration into h/m/s for countdowns. */
export const splitDuration = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60, total };
};

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  chilled: 'Chilled Order',
  dry: 'Dry Groceries',
};
