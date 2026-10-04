// Depots do not deliver on Sundays, so Order Management accepts no orders for them and Planning
// never schedules them (the operating calendar follows the dataset's calendar.csv).
export function isClosedDay(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay() === 0;
}
