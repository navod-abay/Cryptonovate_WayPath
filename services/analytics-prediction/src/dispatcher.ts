import { pool } from './db';

export const BUSINESS_TZ = 'Asia/Colombo';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Rounded % change; null when there is no previous value to compare against. */
export function changePercent(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

type MetricKey = 'deferred' | 'damaged' | 'missing';
interface Totals { deferred: number; damaged: number; missing: number }

/** Deferrals (status events) and store-receipt shortfalls between two Colombo dates, inclusive. */
async function totals(from: string, to: string): Promise<Totals> {
  const { rows } = await pool.query<Totals>(
    `SELECT
       (SELECT COUNT(*)::int FROM order_status_events
         WHERE to_status = 'deferred'
           AND (occurred_at AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date) AS deferred,
       (SELECT COALESCE(SUM(rejected_units), 0)::int FROM order_receipts
         WHERE (received_at AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date) AS damaged,
       (SELECT COALESCE(SUM(missing_units), 0)::int FROM order_receipts
         WHERE (received_at AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date) AS missing`,
    [from, to, BUSINESS_TZ],
  );
  return rows[0];
}

/** The seven days before `date`, compared with the seven days before that. */
export async function dispatcherStatistics(date: string) {
  const period = { from: addDays(date, -7), to: addDays(date, -1) };
  const previousPeriod = { from: addDays(date, -14), to: addDays(date, -8) };
  const [current, previous] = await Promise.all([totals(period.from, period.to), totals(previousPeriod.from, previousPeriod.to)]);
  const keys: MetricKey[] = ['deferred', 'damaged', 'missing'];
  return {
    period,
    previousPeriod,
    metrics: keys.map((key) => ({
      key,
      current: current[key],
      previous: previous[key],
      changePercent: changePercent(current[key], previous[key]),
    })),
  };
}

// Sample units per weekday (Mon–Fri). Not a trained model; replace with a real forecast later.
const SAMPLE_UNITS: Record<'chilled' | 'dry' | 'tech' | 'style', number[]> = {
  chilled: [100, 120, 125, 160, 210],
  dry: [132, 87, 164, 118, 202],
  tech: [11, 11, 32, 39, 137],
  style: [50, 71, 12, 21, 39],
};

/** Monday to Friday of the week after `date`'s week. */
export function demandForecast(date: string) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const monday = addDays(date, (8 - weekday) % 7 || 7);
  return {
    method: 'sample_data',
    unit: 'ordered_units',
    note: 'Sample demand values for demonstration; not produced by a trained model.',
    days: Array.from({ length: 5 }, (_, i) => ({
      date: addDays(monday, i),
      categories: Object.entries(SAMPLE_UNITS).map(([category, values]) => ({ category, predictedUnits: values[i] })),
    })),
  };
}
