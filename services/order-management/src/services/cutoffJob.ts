import { env } from '../config/env.js';
import { pool, withTransaction } from '../db/pool.js';
import { colomboToday, isOperatingDay, nextOperatingDay, prevOperatingDay } from '../domain/calendar.js';
import { isPastCutoff } from '../domain/cutoff.js';
import { appendEvent } from '../repositories/events.repo.js';
import { sweepDeferredIntoPool } from '../repositories/orders.repo.js';
import { clearDeferredForServed, outletDirectory } from '../repositories/outlets.repo.js';

export const CUTOFF_JOB_NAME = 'cutoff_sweep';

export interface CutoffSweepResult {
  closing_date: string;
  service_day: string;
  deferred_swept_to_confirmed: number;
  swept_order_refs: string[];
  outlets_days_since_served_incremented: number;
  outlets_deferred_flag_cleared: number;
  trigger: 'timer' | 'manual';
}

export interface CutoffSweepOutcome {
  job_name: string;
  job_key: string;
  already_ran: boolean;
  ran_at: Date;
  result: CutoffSweepResult | null;
}

/**
 * Closes ordering for `closingDate`. Idempotent per date: the service_jobs guard row is
 * inserted first in the same transaction, so a concurrent or repeated run is a no-op.
 */
export async function runCutoffSweep(closingDate: string, trigger: 'timer' | 'manual'): Promise<CutoffSweepOutcome> {
  return withTransaction(async (client) => {
    const guard = await client.query<{ ran_at: Date }>(
      `INSERT INTO service_jobs (job_name, job_key) VALUES ($1, $2)
       ON CONFLICT (job_name, job_key) DO NOTHING
       RETURNING ran_at`,
      [CUTOFF_JOB_NAME, closingDate],
    );

    if (guard.rowCount === 0) {
      const { rows } = await client.query<{ ran_at: Date; result: CutoffSweepResult | null }>(
        'SELECT ran_at, result FROM service_jobs WHERE job_name = $1 AND job_key = $2',
        [CUTOFF_JOB_NAME, closingDate],
      );
      return { job_name: CUTOFF_JOB_NAME, job_key: closingDate, already_ran: true, ran_at: rows[0].ran_at, result: rows[0].result };
    }

    // Fairness counters are about the last operating day's deliveries before this run.
    const serviceDay = prevOperatingDay(closingDate);

    const swept = await sweepDeferredIntoPool(closingDate, client);
    for (const orderRef of swept) {
      await appendEvent(
        {
          orderRef,
          from: 'deferred',
          to: 'confirmed',
          reasonNote: `Swept into the ${closingDate} run at cutoff`,
          actorRole: 'system',
        },
        client,
      );
    }

    const incremented = await outletDirectory.incrementDaysSinceServed(serviceDay, client);
    const cleared = await clearDeferredForServed(serviceDay, client);

    const result: CutoffSweepResult = {
      closing_date: closingDate,
      service_day: serviceDay,
      deferred_swept_to_confirmed: swept.length,
      swept_order_refs: swept,
      outlets_days_since_served_incremented: incremented,
      outlets_deferred_flag_cleared: cleared,
      trigger,
    };
    await client.query('UPDATE service_jobs SET result = $3 WHERE job_name = $1 AND job_key = $2', [
      CUTOFF_JOB_NAME,
      closingDate,
      JSON.stringify(result),
    ]);

    return { job_name: CUTOFF_JOB_NAME, job_key: closingDate, already_ran: false, ran_at: guard.rows[0].ran_at, result };
  });
}

let timer: NodeJS.Timeout | null = null;
let running = false;

async function tick(): Promise<void> {
  if (running) return;
  const at = new Date();
  const today = colomboToday(at);
  if (!isOperatingDay(today) || !isPastCutoff(at)) return;

  const closingDate = nextOperatingDay(today);
  running = true;
  try {
    const { rowCount } = await pool.query('SELECT 1 FROM service_jobs WHERE job_name = $1 AND job_key = $2', [
      CUTOFF_JOB_NAME,
      closingDate,
    ]);
    if (rowCount) return;
    const outcome = await runCutoffSweep(closingDate, 'timer');
    if (!outcome.already_ran) {
      console.log(`⏰ Cutoff sweep closed ${closingDate}:`, outcome.result);
    }
  } catch (err) {
    console.error(`❌ Cutoff sweep for ${closingDate} failed; will retry next tick:`, err);
  } finally {
    running = false;
  }
}

export function startCutoffTimer(): void {
  if (timer) return;
  timer = setInterval(() => void tick(), env.CUTOFF_JOB_INTERVAL_MS);
  timer.unref();
  void tick();
  console.log(`⏱️ Cutoff timer started (every ${env.CUTOFF_JOB_INTERVAL_MS / 1000}s, cutoff ${env.ORDER_CUTOFF_HOUR}:00 ${env.BUSINESS_TZ}).`);
}

export function stopCutoffTimer(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
