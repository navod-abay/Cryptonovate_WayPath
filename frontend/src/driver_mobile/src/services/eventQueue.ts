import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ROUTES, fetchWithTimeout } from '../api/config';
import { getAccessToken } from '../api/auth';

/**
 * A queue of driver events for one execution-sync route, kept on the phone so nothing is lost
 * without signal. Every event is saved first and then sent; what could not be sent goes out on the
 * next flush (app open, network back, or the periodic retry in useNetworkSync). Each event carries
 * an id generated here and the server ignores one it has already applied, so re-sending after a lost
 * response changes nothing.
 */
export interface QueuedEvent {
  clientEventId: string;
  /** When the driver did it, not when it was sent. */
  capturedAt: string;
}

const BATCH_SIZE = 100;

export const uuid = (): string => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
};

/**
 * @param storageKey AsyncStorage key of the queue
 * @param path       route under /api/execution that takes a batch
 * @param bodyKey    the batch's property in the request body, e.g. { incidents: [...] }
 */
export function createEventQueue<T extends QueuedEvent>(storageKey: string, path: string, bodyKey: string) {
  const read = async (): Promise<T[]> => {
    try {
      const raw = await AsyncStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  // All queue writes run one after another, so removing sent events never overwrites one saved meanwhile.
  let queueLock: Promise<unknown> = Promise.resolve();
  const update = (change: (queue: T[]) => T[]): Promise<void> => {
    const run = queueLock.then(async () => {
      await AsyncStorage.setItem(storageKey, JSON.stringify(change(await read())));
    });
    queueLock = run.catch(() => undefined);
    return run;
  };
  const remove = (ids: string[]) => update(queue => queue.filter(e => !ids.includes(e.clientEventId)));

  const post = async (token: string, events: T[]) =>
    fetchWithTimeout(`${API_ROUTES.EXECUTION}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ [bodyKey]: events }),
    });

  /** A malformed event would block the queue forever: find it by sending one at a time, and drop it. */
  async function dropRejected(token: string, batch: T[]) {
    for (const event of batch) {
      try {
        const res = await post(token, [event]);
        if (res.ok) await remove([event.clientEventId]);
        else if (res.status === 400) {
          console.warn(`[eventQueue ${path}] Server rejected event, dropping it:`, event.clientEventId, await res.text());
          await remove([event.clientEventId]);
        }
      } catch {
        return;
      }
    }
  }

  async function sendQueued() {
    const token = await getAccessToken();
    if (!token) return;
    for (;;) {
      const batch = (await read()).slice(0, BATCH_SIZE);
      if (batch.length === 0) return;
      let res: Response;
      try {
        res = await post(token, batch);
      } catch {
        return; // no signal: keep everything for the next flush
      }
      if (res.ok) {
        await remove(batch.map(e => e.clientEventId));
        if (batch.length < BATCH_SIZE) return;
        continue;
      }
      if (res.status === 400) await dropRejected(token, batch);
      return; // 401/403/5xx: keep and retry later
    }
  }

  let flushing: Promise<void> | null = null;

  /** Sends queued events. One flush at a time; callers during a flush share it. */
  const flush = (): Promise<void> => {
    flushing ??= sendQueued().finally(() => { flushing = null; });
    return flushing;
  };

  /** Saves the event and tries to send it now. Resolves 'queued' when it will be sent later. */
  async function record(input: Omit<T, 'clientEventId' | 'capturedAt'>): Promise<'sent' | 'queued'> {
    const event = { ...input, clientEventId: uuid(), capturedAt: new Date().toISOString() } as T;
    await update(queue => [...queue, event]);
    const pending = async () => (await read()).some(e => e.clientEventId === event.clientEventId);
    await flush();
    // A flush that was already running read the queue before this event was added: go again.
    if (await pending()) await flush();
    return (await pending()) ? 'queued' : 'sent';
  }

  return { record, flush, pending: read };
}
