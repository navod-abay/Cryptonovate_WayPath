import { Response } from 'express';
import { AccessTokenPayload } from '../middleware/auth';
import { AlertRow, canSee, viewFor } from './alerts';

/**
 * Open Server-Sent Event streams. Each stored alert is pushed to the streams whose user may see
 * it. Alerts are buffered briefly and sent as one `alerts` frame, so a backlog flushed by a driver
 * coming back online reaches the browser as one update rather than dozens.
 *
 * Frames:  event: alerts  id: <seq>  data: [view, ...]   (seq = SSE Last-Event-ID for replay)
 *          event: ready   id: <seq>  data: {}            (sent once on connect)
 */
const FLUSH_DELAY_MS = 250;
const HEARTBEAT_MS = 25_000;

interface Connection {
  user: AccessTokenPayload;
  res: Response;
  pending: AlertRow[];
  flushTimer?: NodeJS.Timeout;
}

const connections = new Set<Connection>();

function writeFrame(conn: Connection, event: string, seq: number, data: unknown) {
  conn.res.write(`id: ${seq}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function flush(conn: Connection) {
  conn.flushTimer = undefined;
  if (conn.pending.length === 0) return;
  const rows = conn.pending.splice(0);
  writeFrame(conn, 'alerts', Math.max(...rows.map((r) => Number(r.seq))), rows.map((r) => viewFor(conn.user, r)));
}

export function openStream(user: AccessTokenPayload, res: Response, cursor: number, replay: AlertRow[]) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 5000\n\n');

  const conn: Connection = { user, res, pending: [] };
  connections.add(conn);
  if (replay.length > 0) {
    writeFrame(conn, 'alerts', Number(replay[replay.length - 1].seq), replay.map((r) => viewFor(user, r)));
  }
  writeFrame(conn, 'ready', Math.max(cursor, ...replay.map((r) => Number(r.seq))), {});

  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
  // The stream must not outlive the token that opened it; the client reconnects with a fresh one.
  const expiry = user.exp ? setTimeout(() => res.end(), Math.max(0, user.exp * 1000 - Date.now())) : undefined;
  res.on('close', () => {
    clearInterval(heartbeat);
    if (expiry) clearTimeout(expiry);
    if (conn.flushTimer) clearTimeout(conn.flushTimer);
    connections.delete(conn);
  });
}

export function broadcast(row: AlertRow) {
  for (const conn of connections) {
    if (!canSee(conn.user, row)) continue;
    conn.pending.push(row);
    conn.flushTimer ??= setTimeout(() => flush(conn), FLUSH_DELAY_MS);
  }
}

export const openStreamCount = () => connections.size;
