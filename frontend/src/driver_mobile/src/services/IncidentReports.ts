import { createEventQueue, QueuedEvent } from './eventQueue';

/**
 * Driver incident reports (Report Issue screen) → POST /api/execution/driver/incidents.
 *
 * Every report is saved to the queue first and then sent, so a report made without signal is
 * never lost (see eventQueue). The server ignores a report id it has already stored, so re-sending
 * after a lost response cannot raise a second alert.
 */
export type IncidentIssue = 'no_receive' | 'closed' | 'refused' | 'blocked';

export interface IncidentReport extends QueuedEvent {
  tripId?: string;
  stopId?: string;
  outletId?: string;
  issue: IncidentIssue;
  action?: string;
  notes?: string;
}

const queue = createEventQueue<IncidentReport>('@incident_reports_queue', '/driver/incidents', 'incidents');

/** Saves the report and tries to send it now. Resolves 'queued' when it will be sent later. */
export const reportIncident = queue.record;

/** Sends queued reports. One flush at a time; callers during a flush share it. */
export const flushIncidents = queue.flush;
