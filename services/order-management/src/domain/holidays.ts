/**
 * Non-Sunday closed days from the challenge dataset data/calendar.csv (is_operating = 0).
 * The CSV covers 2024-01-01 … 2026-06-28 and has no operating Sundays, so within that range
 * "Sunday or one of these dates" reproduces it exactly. Beyond the range only the weekday rule
 * and env.HOLIDAY_DATES apply — add later holidays there.
 */
export const DATASET_HOLIDAYS: readonly string[] = [
  '2024-04-13', // Sinhala & Tamil New Year
  '2024-05-01',
  '2024-12-25', // Christmas
  '2025-04-14', // Sinhala & Tamil New Year
  '2025-04-15',
  '2025-05-01',
  '2025-12-25', // Christmas
  '2026-04-13', // Sinhala & Tamil New Year
  '2026-04-14',
  '2026-05-01', // Vesak
];
