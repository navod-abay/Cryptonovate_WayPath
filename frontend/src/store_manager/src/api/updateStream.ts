/**
 * Live "Recent Updates" from GET /notifications/stream (notification-service, Server-Sent Events).
 *
 * fetch() instead of EventSource because the stream needs the bearer token in a header. The server
 * ends the stream when the access token expires (and on restarts or network drops); we reconnect
 * with Last-Event-ID so it replays anything missed. Polling (POLL_INTERVAL_MS) keeps running as the
 * fallback, and refreshes the list after every (re)connect.
 */
import { API_BASE_URL, USE_MOCK } from './config';
import { tryRefresh } from './http';
import { getState } from '@/state/store';
import type { Update } from '@/types';

interface Handlers {
  onUpdates: (updates: Update[]) => void;
  /** Connected: reload the list so nothing published before the stream opened is missed. */
  onReady: () => void;
}

const MAX_RETRY_MS = 30_000;

export function subscribeUpdates(handlers: Handlers): () => void {
  if (USE_MOCK) return () => undefined;
  let stopped = false;
  let lastEventId: string | undefined;
  let retry = 1000;
  let controller: AbortController | undefined;

  const run = async () => {
    while (!stopped) {
      const token = getState().session?.token;
      if (!token) return;
      controller = new AbortController();
      try {
        const res = await fetch(`${API_BASE_URL}/notifications/stream`, {
          signal: controller.signal,
          headers: { Accept: 'text/event-stream', Authorization: `Bearer ${token}`, ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}) },
        });
        if (res.status === 401) {
          if (await tryRefresh()) continue;
          return;
        }
        if (!res.ok || !res.body) throw new Error(`Update stream failed (${res.status})`);
        retry = 1000;
        await readEvents(res.body, (event, id, data) => {
          if (id) lastEventId = id;
          if (event === 'ready') handlers.onReady();
          else if (event === 'alerts') handlers.onUpdates(JSON.parse(data) as Update[]);
        });
      } catch {
        /* dropped connection or bad frame: reconnect below */
      }
      if (stopped) return;
      await new Promise((resolve) => setTimeout(resolve, retry));
      retry = Math.min(retry * 2, MAX_RETRY_MS);
    }
  };
  void run();
  return () => { stopped = true; controller?.abort(); };
}

/** Minimal text/event-stream parser: id, event and data fields; comment lines are heartbeats. */
async function readEvents(body: ReadableStream<Uint8Array>, onEvent: (event: string, id: string | undefined, data: string) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n?/g, '\n');
    let end;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      let event = 'message';
      let id: string | undefined;
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (!line || line.startsWith(':')) continue;
        const colon = line.indexOf(':');
        const field = colon < 0 ? line : line.slice(0, colon);
        const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
        if (field === 'event') event = value;
        else if (field === 'id') id = value;
        else if (field === 'data') data.push(value);
      }
      if (data.length || event !== 'message') onEvent(event, id, data.join('\n'));
    }
  }
}
