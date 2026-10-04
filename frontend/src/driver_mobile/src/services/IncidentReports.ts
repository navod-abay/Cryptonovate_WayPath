import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ROUTES, fetchWithTimeout } from '../api/config';
import { getAccessToken } from '../api/auth';

/**
 * Driver incident reports (Report Issue screen) → POST /api/execution/driver/incidents.
 *
 * Every report is saved to the queue first and then sent, so a report made without signal is
 * never lost: it goes out on the next flush (app open, network back, or the periodic retry in
 * useNetworkSync). Each report carries an id generated here; the server ignores an id it has
 * already stored, so re-sending after a lost response cannot raise a second alert.
 */
export type IncidentIssue = 'no_receive' | 'closed' | 'refused' | 'blocked';

export interface IncidentReport {
  clientEventId: string;
  tripId?: string;
  stopId?: string;
  outletId?: string;
  issue: IncidentIssue;
  action?: string;
  notes?: string;
  /** When the driver made the report, not when it was sent. */
  capturedAt: string;
}

const STORAGE_KEY = '@incident_reports_queue';
const BATCH_SIZE = 100;

const uuid = (): string => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
};

const readQueue = async (): Promise<IncidentReport[]> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

// All queue writes run one after another, so removing sent reports never overwrites one saved meanwhile.
let queueLock: Promise<unknown> = Promise.resolve();
const updateQueue = (change: (queue: IncidentReport[]) => IncidentReport[]): Promise<void> => {
  const run = queueLock.then(async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(change(await readQueue())));
  });
  queueLock = run.catch(() => undefined);
  return run;
};
const removeFromQueue = (ids: string[]) => updateQueue(queue => queue.filter(r => !ids.includes(r.clientEventId)));

const post = async (token: string, incidents: IncidentReport[]) =>
  fetchWithTimeout(`${API_ROUTES.EXECUTION}/driver/incidents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ incidents }),
  });

/** Saves the report and tries to send it now. Resolves 'queued' when it will be sent later. */
export async function reportIncident(input: Omit<IncidentReport, 'clientEventId' | 'capturedAt'>): Promise<'sent' | 'queued'> {
  const report: IncidentReport = { ...input, clientEventId: uuid(), capturedAt: new Date().toISOString() };
  await updateQueue(queue => [...queue, report]);
  const pending = async () => (await readQueue()).some(r => r.clientEventId === report.clientEventId);
  await flushIncidents();
  // A flush that was already running read the queue before this report was added: go again.
  if (await pending()) await flushIncidents();
  return (await pending()) ? 'queued' : 'sent';
}

let flushing: Promise<void> | null = null;

/** Sends queued reports. One flush at a time; callers during a flush share it. */
export const flushIncidents = (): Promise<void> => {
  flushing ??= sendQueued().finally(() => { flushing = null; });
  return flushing;
};

async function sendQueued() {
  const token = await getAccessToken();
  if (!token) return;
  for (;;) {
    const batch = (await readQueue()).slice(0, BATCH_SIZE);
    if (batch.length === 0) return;
    let res: Response;
    try {
      res = await post(token, batch);
    } catch {
      return; // no signal: keep everything for the next flush
    }
    if (res.ok) {
      // The server answers with accepted + duplicates, which together are the whole batch.
      await removeFromQueue(batch.map(r => r.clientEventId));
      if (batch.length < BATCH_SIZE) return;
      continue;
    }
    if (res.status === 400) await dropRejected(token, batch);
    return; // 401/403/5xx: keep and retry later
  }
}

/** A malformed report would block the queue forever: find it by sending one at a time, and drop it. */
async function dropRejected(token: string, batch: IncidentReport[]) {
  for (const report of batch) {
    try {
      const res = await post(token, [report]);
      if (res.ok) await removeFromQueue([report.clientEventId]);
      else if (res.status === 400) {
        console.warn('[IncidentReports] Server rejected report, dropping it:', report.clientEventId, await res.text());
        await removeFromQueue([report.clientEventId]);
      }
    } catch {
      return;
    }
  }
}
