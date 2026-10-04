/** Minutes from now until an HH:MM departure today (0 once it has passed). */
export function minutesUntil(departure: string, now = new Date()): number {
  const [h, m] = departure.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return Math.max(0, h * 60 + m - (now.getHours() * 60 + now.getMinutes()));
}
