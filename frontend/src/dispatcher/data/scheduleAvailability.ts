import { addDays } from './presentation';

// Daily planning starts at 17:00 Sri Lanka time on the preceding day.
export function scheduleAvailableFrom(date: string) {
  return new Date(`${addDays(date,-1)}T17:00:00+05:30`);
}
export function isScheduleAvailable(date: string, now = new Date()) {
  return now.getTime() >= scheduleAvailableFrom(date).getTime();
}

// Depots do not deliver on Sundays, so Order Management accepts no orders for them and Planning
// never schedules them (the operating calendar follows the dataset's calendar.csv).
export function isClosedDay(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay() === 0;
}
