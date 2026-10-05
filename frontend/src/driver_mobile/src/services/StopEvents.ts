import { createEventQueue, QueuedEvent } from './eventQueue';

/**
 * Arrivals at and departures from outlet stops → POST /api/execution/driver/stop-events.
 *
 * Saved on the phone first, so the trip carries on without signal and the server catches up when
 * the network is back (see eventQueue). Each time on the server keeps the earliest one captured.
 * The depot is not a stop here: checking in and leaving there go through the loaders, online.
 */
export interface StopEvent extends QueuedEvent {
  tripId: string;
  stopId: string;
  type: 'arrival' | 'departure';
  /** A departure after a delivery made without signal (photos instead of the store's code). */
  offline?: boolean;
}

const queue = createEventQueue<StopEvent>('@stop_events_queue', '/driver/stop-events', 'events');

export const recordStopEvent = queue.record;
export const flushStopEvents = queue.flush;
/** Events not on the server yet, oldest first. */
export const pendingStopEvents = queue.pending;
