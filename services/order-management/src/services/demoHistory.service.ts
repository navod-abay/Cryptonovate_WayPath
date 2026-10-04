import { env } from '../config/env.js';
import { businessInstant, colomboToday, prevOperatingDay } from '../domain/calendar.js';
import { appError } from '../domain/errors.js';
import { assertTransition, type OrderStatus } from '../domain/statusMachine.js';
import { withTransaction } from '../db/pool.js';
import { appendEvent } from '../repositories/events.repo.js';
import { setStatus } from '../repositories/orders.repo.js';
import { outletDirectory } from '../repositories/outlets.repo.js';
import type { SimulateDeliveryInput } from '../schemas/orders.schema.js';

/**
 * Demo history: completes a past day the way Execution & Sync would have, so the seeded past days
 * show delivered, received orders and the outlet fairness counters see who was served.
 *
 * Every `allocated` order of the date goes allocated → loaded → out_for_delivery → delivered →
 * received, with a full receipt. Events carry the role that does each step in real operation
 * (loader, driver, store manager) and times from the plan: loaded 25 minutes before the trip leaves,
 * out for delivery at departure, delivered at the planned arrival (or the window opening, if the
 * truck arrives early), received 15 minutes later. Only available with demo data, for past dates.
 *
 * The plan itself was made when the service started, so its events (allocated, and any deferral)
 * carry today's time. They are moved to the planning slot just after the cutoff on the evening
 * before the delivery day, keeping their order, so each order's history reads in sequence.
 */

const LOADED_BEFORE_DEPARTURE_MIN = 25;
const RECEIVED_AFTER_DELIVERY_MIN = 15;
const PLANNED_AT = '16:05'; // just after the 16:00 cutoff on the previous operating day

const plusMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

export async function simulateDelivery(input: SimulateDeliveryInput) {
  if (!env.SEED_DEMO_DATA) {
    throw appError('FORBIDDEN', 'Delivery simulation is only available when demo data is enabled (SEED_DEMO_DATA=true)');
  }
  if (input.date >= colomboToday()) {
    throw appError('VALIDATION_ERROR', 'Only past days can be marked delivered', [{ field: 'date', message: `must be before ${colomboToday()}` }]);
  }
  const planned = new Map(input.deliveries.map((d) => [d.order_ref, d]));

  return withTransaction(async (client) => {
    const { rows } = await client.query<{ order_ref: string; outlet_id: string; order_units: number; window_open: string }>(
      `SELECT order_ref, outlet_id, order_units, to_char(window_open_time, 'HH24:MI') AS window_open
         FROM orders WHERE order_date = $1 AND status = 'allocated'
        ORDER BY order_ref FOR UPDATE`,
      [input.date],
    );
    const plannedAt = businessInstant(prevOperatingDay(input.date), PLANNED_AT);
    for (const o of rows) {
      // Planning events written after the planning slot (i.e. when the plan was actually made) move into it.
      await client.query(
        `UPDATE order_status_events e SET occurred_at = $2::timestamptz + x.rn * interval '1 second'
           FROM (SELECT id, row_number() OVER (ORDER BY occurred_at, id) AS rn
                   FROM order_status_events WHERE order_ref = $1 AND occurred_at > $2::timestamptz) x
          WHERE e.id = x.id`,
        [o.order_ref, plannedAt],
      );
      const plan = planned.get(o.order_ref);
      const windowOpen = businessInstant(input.date, o.window_open);
      const departed = plan ? businessInstant(input.date, plan.departure_time) : plusMinutes(windowOpen, -60);
      const arrived = plan ? businessInstant(input.date, plan.arrival_time) : windowOpen;
      const delivered = arrived > windowOpen ? arrived : windowOpen;
      const steps: [OrderStatus, OrderStatus, string, Date][] = [
        ['allocated', 'loaded', 'loader', plusMinutes(departed, -LOADED_BEFORE_DEPARTURE_MIN)],
        ['loaded', 'out_for_delivery', 'driver', departed],
        ['out_for_delivery', 'delivered', 'driver', delivered],
        ['delivered', 'received', 'store_manager', plusMinutes(delivered, RECEIVED_AFTER_DELIVERY_MIN)],
      ];
      for (const [from, to, role, at] of steps) {
        assertTransition(from, to);
        await appendEvent({ orderRef: o.order_ref, from, to, actorRole: role, at, reasonNote: to === 'received' ? 'Demo history: full receipt' : null }, client);
      }
      await client.query(
        `INSERT INTO order_receipts (order_ref, received_units, missing_units, rejected_units, note, received_at)
         VALUES ($1, $2, 0, 0, 'Demo history: full receipt', $3)
         ON CONFLICT (order_ref) DO NOTHING`,
        [o.order_ref, o.order_units, steps[3][3]],
      );
      await setStatus(o.order_ref, 'received', client);
      await outletDirectory.markServed(o.outlet_id, input.date, client);
    }
    return { date: input.date, received: rows.length };
  });
}
