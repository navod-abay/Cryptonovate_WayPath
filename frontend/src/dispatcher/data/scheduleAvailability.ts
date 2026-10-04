import { addDays } from './presentation';

// Daily planning starts at 17:00 Sri Lanka time on the preceding day.
export function scheduleAvailableFrom(date: string) {
  return new Date(`${addDays(date,-1)}T17:00:00+05:30`);
}
export function isScheduleAvailable(date: string, now = new Date()) {
  return now.getTime() >= scheduleAvailableFrom(date).getTime();
}
