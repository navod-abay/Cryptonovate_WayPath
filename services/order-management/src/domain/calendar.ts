import { AsyncLocalStorage } from 'node:async_hooks';
import { env } from '../config/env.js';

/**
 * Single source of truth for "now" and for every business-day calculation.
 * All wall-clock logic evaluates in env.BUSINESS_TZ (Asia/Colombo), never UTC.
 */

const clockStore = new AsyncLocalStorage<Date>();

export function now(): Date {
  return clockStore.getStore() ?? new Date();
}

/** Runs fn with a frozen "now". Used by the X-Test-Now header (non-production only) and tests. */
export function runWithClock<T>(at: Date, fn: () => T): T {
  return clockStore.run(at, fn);
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

function toUtcDate(date: string): Date {
  if (!isValidIsoDate(date)) {
    throw new RangeError(`Invalid ISO date: ${date}`);
  }
  return new Date(`${date}T00:00:00Z`);
}

export function addDays(date: string, days: number): string {
  const d = toUtcDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayOf(date: string): number {
  return toUtcDate(date).getUTCDay();
}

export interface CalendarConfig {
  timeZone: string;
  nonOperatingWeekdays: readonly number[];
  holidays: readonly string[];
}

export interface BusinessCalendar {
  localDate(at?: Date): string;
  minutesSinceMidnight(at?: Date): number;
  /** The instant at which the business-TZ wall clock reads `date` `time` (HH:mm). */
  instantAt(date: string, time: string): Date;
  isOperatingDay(date: string): boolean;
  nextOperatingDay(after: string): string;
  prevOperatingDay(before: string): string;
  addOperatingDays(from: string, n: number): string;
  operatingDaysBetween(from: string, to: string): number;
}

// Guards against a misconfigured calendar (e.g. every day a holiday) looping forever.
const MAX_SCAN_DAYS = 366;

export function createCalendar(config: CalendarConfig): BusinessCalendar {
  const nonOperating = new Set(config.nonOperatingWeekdays);
  const holidays = new Set(config.holidays);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  const parts = (at: Date) => {
    const p = Object.fromEntries(formatter.formatToParts(at).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) };
  };

  // To adopt calendar.csv later, replace only this function body with a lookup.
  const isOperatingDay = (date: string): boolean => !nonOperating.has(weekdayOf(date)) && !holidays.has(date);

  const step = (from: string, direction: 1 | -1): string => {
    let d = from;
    for (let i = 0; i < MAX_SCAN_DAYS; i++) {
      d = addDays(d, direction);
      if (isOperatingDay(d)) return d;
    }
    throw new Error(`No operating day found within ${MAX_SCAN_DAYS} days of ${from}`);
  };

  return {
    localDate: (at = now()) => parts(at).date,
    minutesSinceMidnight: (at = now()) => {
      const p = parts(at);
      return p.hour * 60 + p.minute;
    },
    instantAt: (date, time) => {
      const [h, m] = time.split(':').map(Number);
      const wallAsUtc = toUtcDate(date).getTime() + (h * 60 + m) * 60_000;
      // Offset of the zone at that moment; two passes settle DST edges.
      let instant = wallAsUtc;
      for (let i = 0; i < 2; i++) {
        const p = parts(new Date(instant));
        const shownAsUtc = toUtcDate(p.date).getTime() + (p.hour * 60 + p.minute) * 60_000;
        instant += wallAsUtc - shownAsUtc;
      }
      return new Date(instant);
    },
    isOperatingDay,
    nextOperatingDay: (after) => step(after, 1),
    prevOperatingDay: (before) => step(before, -1),
    addOperatingDays: (from, n) => {
      let d = from;
      for (let i = 0; i < Math.abs(n); i++) d = step(d, n >= 0 ? 1 : -1);
      return d;
    },
    operatingDaysBetween: (from, to) => {
      if (to <= from) return 0;
      let count = 0;
      for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) {
        if (isOperatingDay(d)) count++;
      }
      return count;
    },
  };
}

export const calendar = createCalendar({
  timeZone: env.BUSINESS_TZ,
  nonOperatingWeekdays: env.NON_OPERATING_WEEKDAYS,
  holidays: env.HOLIDAY_DATES,
});

export const colomboToday = (at: Date = now()): string => calendar.localDate(at);
export const colomboMinutesSinceMidnight = (at: Date = now()): number => calendar.minutesSinceMidnight(at);
export const businessInstant = (date: string, time: string): Date => calendar.instantAt(date, time);
export const isOperatingDay = (date: string): boolean => calendar.isOperatingDay(date);
export const nextOperatingDay = (after: string): string => calendar.nextOperatingDay(after);
export const prevOperatingDay = (before: string): string => calendar.prevOperatingDay(before);
export const addOperatingDays = (from: string, n: number): string => calendar.addOperatingDays(from, n);
export const operatingDaysBetween = (from: string, to: string): number => calendar.operatingDaysBetween(from, to);
