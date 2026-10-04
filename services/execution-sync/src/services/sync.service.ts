import jwt from 'jsonwebtoken';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { pool } from '../db/pool';
import { BulkSyncInput, DeliveryProblemInput, DriverIncidentInput, PodInput, StopEventInput } from '../schemas/execution.schema';
import { AccessTokenPayload } from '../middleware/auth';
import { enqueueAlert, relayPendingAlerts } from './alertOutbox';
import { LoadingService } from './loading.service';

const PLANNING_SERVICE_URL = process.env.PLANNING_SERVICE_URL || 'http://planning-allocation:5003';
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://order-management:5002';
const FLEET_SERVICE_URL = process.env.FLEET_SERVICE_URL || 'http://fleet-directory:5004';
const JWT_SECRET = process.env.JWT_ACCESS_SECRET || 'waypoint_default_jwt_access_secret_key_2026_change_in_prod';

/**
 * Mint a short-lived access token with role "system" for M2M inter-service calls
 */
function mintSystemToken(): string {
  return jwt.sign(
    {
      sub: '00000000-0000-0000-0000-000000000000',
      username: 'execution-sync',
      role: 'system',
      outlet_id: null,
      depot: null,
      type: 'access',
    },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
}

// Helper for safe external REST calls with timeout and M2M authentication
async function safeFetch(url: string, options: RequestInit = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const token = mintSystemToken();

  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    ...(options.headers || {}),
  };

  try {
    const res = await fetch(url, { ...options, headers, signal: controller.signal });
    clearTimeout(timeout);
    return res;
  } catch (err: any) {
    clearTimeout(timeout);
    console.warn(`[sync.service] External HTTP call to ${url} failed or timed out: ${err.message}`);
    return null;
  }
}

const HANDOVER_TTL_SECONDS = 120;
const HANDOVER_MAX_ATTEMPTS = 5;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A failure the controller answers with this status instead of 500. */
export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

/** An error that also carries a machine-readable code; answered like any HttpError, but with the code. */
export class ExecutionError extends HttpError {
  constructor(status: number, public code: string, message: string, details?: unknown) {
    super(status, message, details);
  }
}

/** Reads the order from Order Management with the caller's token, so outlet scope is enforced there. */
async function fetchOrder(orderRef: string, authorization: string | undefined) {
  const res = await safeFetch(`${ORDER_SERVICE_URL}/api/orders/${encodeURIComponent(orderRef)}`, {
    headers: { Accept: 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
  });
  if (!res) throw new ExecutionError(502, 'ORDER_SERVICE_UNAVAILABLE', 'Order Management is unreachable');
  const body: any = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ExecutionError(res.status, body?.error?.code || 'ORDER_LOOKUP_FAILED', body?.error?.message || `Order lookup failed (${res.status})`, body?.error?.details);
  }
  return body?.data;
}

/** The 6-digit handover code is derived from a per-issue random value, so it never has to be stored. */
function handoverCode(orderRef: string, nonce: string): string {
  const digest = createHmac('sha256', JWT_SECRET).update(`${orderRef}|${nonce}`).digest();
  return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, '0');
}

/**
 * Order Management only knows order statuses. A full or partial drop-off is a delivered order;
 * a rejected stop leaves the order where it is (the dispatcher decides what happens next).
 */
const ORDER_STATUS_FOR: Record<string, 'delivered' | undefined> = {
  delivered: 'delivered',
  partially_delivered: 'delivered',
  completed: 'delivered',
};

/** The caller's own token is used, so Order Management accepts the change and the audit trail names the driver. */
function notifyOrderStatus(orderRef: string, executionStatus: string, authorization?: string) {
  const status = ORDER_STATUS_FOR[executionStatus];
  if (!status) return;
  safeFetch(`${ORDER_SERVICE_URL}/api/orders/${encodeURIComponent(orderRef)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
    body: JSON.stringify({ status }),
  }).then((res) => {
    if (res && !res.ok) console.warn(`[sync.service] Order Management refused ${orderRef} -> ${status} (${res.status})`);
  });
}

/**
 * Order Management: loaded -> out_for_delivery when the truck leaves the depot. With the driver's
 * token when there is one (the order history shows the driver), else a system token. An order that
 * is already out for delivery counts as done. Returns whether Order Management has it.
 */
async function markOutForDelivery(orderRef: string, depot: string, bearer?: string): Promise<boolean> {
  const res = await safeFetch(`${ORDER_SERVICE_URL}/api/orders/${encodeURIComponent(orderRef)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: bearer } : {}) },
    body: JSON.stringify({ status: 'out_for_delivery', reason_note: `Left the ${depot} depot` }),
  });
  if (!res) return false;
  if (res.ok) return true;
  const body: any = await res.json().catch(() => null);
  if (res.status === 409 && body?.error?.details?.from === 'out_for_delivery') return true;
  console.warn(`[sync.service] Order Management refused ${orderRef} -> out_for_delivery (${res.status}): ${body?.error?.message ?? ''}`);
  return false;
}

const ISSUE_LABEL: Record<string, string> = {
  no_receive: 'No one to receive',
  closed: 'Outlet closed',
  refused: 'Refused items',
  blocked: 'Road access blocked',
};
const ACTION_LABEL: Record<string, string> = {
  waited: 'Waited 15 minutes',
  called: 'Called the manager',
  alt_route: 'Took an alternative route',
  skipped: 'Skipped the outlet',
  partial: 'Partial unload',
  returned: 'Returned all items',
  wait_clear: 'Waited for clearance',
};
const OFFLINE_DELIVERY_LABEL: Record<string, string> = {
  delivered: 'Delivered offline',
  partially_delivered: 'Partially delivered offline',
  rejected: 'Delivery rejected (offline)',
};
/** Device clocks drift; a capture time in the future is treated as "now". */
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

function occurredAt(captured: string, received = Date.now()) {
  const at = Date.parse(captured);
  return new Date(at - received > MAX_CLOCK_SKEW_MS ? received : at).toISOString();
}

/** A UUID that is always the same for the same key, so an event sent twice raises one alert. */
function stableUuid(key: string): string {
  const h = createHash('sha256').update(key).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function actorOf(user?: AccessTokenPayload) {
  return { actorId: user?.userId || null, actorName: user?.username || null, depot: user?.depot || null };
}

/** Planning's TripDetail (GET /api/planning/trips/{tripId}); only the fields read here. */
export interface PlannedTrip {
  tripId: string;
  tripNumber: number;
  planDate: string;
  depot: string;
  vehicleId: string;
  vehicleType: string;
  vehicleTemperature: string;
  departureTime: string;
  loaderId?: string;
  loaderName?: string;
  stops: Array<{ stopId: string; orderRef: string; outletId: string; items: Array<{ sku: string; description: string; qty: number }> }>;
}

/** Calls Planning with a service token; its 404/403 pass through, anything else is a 502. */
export async function planningJson<T>(path: string): Promise<T> {
  const res = await safeFetch(`${PLANNING_SERVICE_URL}${path}`);
  if (!res) throw new HttpError(502, 'Planning & Allocation is unreachable');
  const body = await res.json().catch(() => null);
  if (res.status === 404 || res.status === 403) throw new HttpError(res.status, body?.error || `Planning answered ${res.status}`);
  if (!res.ok) throw new HttpError(502, `Planning & Allocation answered ${res.status}: ${body?.error ?? ''}`.trim());
  return body as T;
}

/** Today in Colombo (YYYY-MM-DD): the plan date loaders work on. */
export function colomboToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(now);
}

/**
 * loading_manifests.status -> the loader app's queue. A trip with no manifest yet is ready to load
 * only once its driver has started it in the app and marked "I've Arrived" at the depot.
 */
function loadingStatus(manifest: string | undefined, driverArrived: boolean) {
  if (manifest === 'completed') return 'completed';
  if (manifest === 'in_progress') return 'loading';
  return driverArrived ? 'ready_to_load' : 'awaiting_driver';
}

interface TripState {
  manifest?: string;
  driverStartedAt: string | null;
  depotArrivedAt: string | null;
  depotDepartedAt: string | null;
}

const iso = (d: Date | null) => d?.toISOString() ?? null;

/** Loading and driver progress for each trip, by trip id. */
async function tripStates(tripIds: string[]): Promise<Map<string, TripState>> {
  const states = new Map<string, TripState>(tripIds.map((id) => [id, { driverStartedAt: null, depotArrivedAt: null, depotDepartedAt: null }]));
  if (tripIds.length === 0) return states;
  const [manifests, progress] = await Promise.all([
    pool.query<{ trip_id: string; status: string }>('SELECT trip_id, status FROM loading_manifests WHERE trip_id = ANY($1)', [tripIds]),
    pool.query<{ trip_id: string; started_at: Date; depot_arrived_at: Date | null; depot_departed_at: Date | null }>(
      'SELECT trip_id, started_at, depot_arrived_at, depot_departed_at FROM driver_trip_progress WHERE trip_id = ANY($1)',
      [tripIds],
    ),
  ]);
  for (const r of manifests.rows) states.get(r.trip_id)!.manifest = r.status;
  for (const r of progress.rows) {
    const st = states.get(r.trip_id)!;
    st.driverStartedAt = iso(r.started_at);
    st.depotArrivedAt = iso(r.depot_arrived_at);
    st.depotDepartedAt = iso(r.depot_departed_at);
  }
  return states;
}

function statusOf(st: TripState | undefined) {
  return loadingStatus(st?.manifest, !!st?.depotArrivedAt);
}

export class ExecutionSyncService {
  /**
   * Store manager starts unloading: the vehicle is at the outlet. Only valid while the order is
   * out for delivery. The caller's token is forwarded, so Order Management enforces outlet scope.
   */
  static async startUnloading(orderRef: string, authorization: string | undefined, userId?: string) {
    const order = await fetchOrder(orderRef, authorization);
    if (order?.status !== 'out_for_delivery') {
      throw new ExecutionError(409, 'INVALID_STATE', `Unloading can only start while the order is out for delivery; ${orderRef} is '${order?.status}'`, { status: order?.status });
    }

    const startedBy = userId && UUID_PATTERN.test(userId) ? userId : null;
    const inserted = await pool.query(
      `INSERT INTO store_unloadings (order_ref, outlet_id, started_by) VALUES ($1, $2, $3)
       ON CONFLICT (order_ref) DO NOTHING RETURNING *`,
      [orderRef, order.outlet_id, startedBy],
    );
    const created = inserted.rows.length > 0;
    const row = created ? inserted.rows[0] : (await pool.query('SELECT * FROM store_unloadings WHERE order_ref = $1', [orderRef])).rows[0];
    return {
      created,
      unloading: { order_ref: row.order_ref, outlet_id: row.outlet_id, status: 'unloading', started_at: row.started_at, started_by: row.started_by },
    };
  }

  /** Orders of an outlet whose unloading has started. */
  /** Orders whose truck the driver has marked as arrived at the outlet (store manager's view). */
  static async listArrivals(outletId: string) {
    const result = await pool.query(
      `SELECT order_ref, arrived_at FROM stop_progress
        WHERE outlet_id = $1 AND arrived_at IS NOT NULL AND arrived_at > now() - interval '2 days'
        ORDER BY arrived_at DESC`,
      [outletId],
    );
    return result.rows;
  }

  static async listUnloadings(outletId: string) {
    const result = await pool.query(
      'SELECT order_ref, started_at FROM store_unloadings WHERE outlet_id = $1 ORDER BY started_at DESC',
      [outletId],
    );
    return result.rows;
  }


  /**
   * The loader's queue: the trips of the vehicles Planning assigned to this loader for the day (a
   * dispatcher sees the whole depot), each with its loading status from loading_manifests.
   */
  static async getActiveTrips(depot: string, user: AccessTokenPayload | undefined, status?: string, date?: string) {
    if (user?.role === 'loader' && (!user.depot || user.depot.toLowerCase() !== depot.toLowerCase())) {
      throw new HttpError(403, `A loader for ${user.depot ?? 'no depot'} may not see ${depot}`);
    }
    const params = new URLSearchParams({ date: date || colomboToday(), depot });
    if (user?.role === 'loader') params.set('loaderId', user.userId || '');
    const trips: PlannedTrip[] = await planningJson(`/api/planning/trips?${params}`);

    const states = await tripStates(trips.map((t) => t.tripId));
    const queue = trips
      .map((t) => ({
        tripId: t.tripId,
        tripNumber: t.tripNumber,
        vehicleId: t.vehicleId,
        vehicleType: t.vehicleType,
        temperature: t.vehicleTemperature === 'reefer' ? 'frozen' : 'ambient',
        departureTime: t.departureTime,
        stops: t.stops.length,
        status: statusOf(states.get(t.tripId)),
        depotArrivedAt: states.get(t.tripId)?.depotArrivedAt ?? null,
        dock: t.depot,
        loaderId: t.loaderId ?? null,
        loaderName: t.loaderName ?? null,
      }))
      .sort((a, b) => a.departureTime.localeCompare(b.departureTime) || a.vehicleId.localeCompare(b.vehicleId));
    return status ? queue.filter((t) => t.status === status) : queue;
  }

  /**
   * A driver's day: the planned trips of the vehicle in their token for the date (today in Colombo
   * by default), in trip order, each with whether the loaders have released it. A dispatcher names
   * the vehicle.
   */
  static async getDriverTrips(user: AccessTokenPayload | undefined, date?: string, vehicleId?: string) {
    const vehicle = user?.role === 'driver' ? user.vehicle_id : vehicleId;
    if (!vehicle) {
      throw new HttpError(user?.role === 'driver' ? 403 : 400,
        user?.role === 'driver' ? 'This driver account is not linked to a vehicle' : 'vehicleId is required');
    }
    const day = date || colomboToday();
    const params = new URLSearchParams({ date: day, vehicleId: vehicle });
    const trips: PlannedTrip[] = await planningJson(`/api/planning/trips?${params}`);
    const states = await tripStates(trips.map((t) => t.tripId));
    const { rows: stops } = await pool.query<{ stop_id: string; arrived_at: Date | null; departed_at: Date | null; offline_delivery: boolean }>(
      'SELECT stop_id, arrived_at, departed_at, offline_delivery FROM stop_progress WHERE trip_id = ANY($1)',
      [trips.map((t) => t.tripId)],
    );
    const stopProgress = new Map(stops.map((r) => [r.stop_id, r]));
    return {
      date: day,
      vehicleId: vehicle,
      trips: trips
        .sort((a, b) => a.tripNumber - b.tripNumber)
        .map((t) => {
          const st = states.get(t.tripId);
          return {
            ...t,
            loadingStatus: statusOf(st),
            driverStartedAt: st?.driverStartedAt ?? null,
            depotArrivedAt: st?.depotArrivedAt ?? null,
            depotDepartedAt: st?.depotDepartedAt ?? null,
            stops: t.stops.map((s) => {
              const p = stopProgress.get(s.stopId);
              return { ...s, arrivedAt: iso(p?.arrived_at ?? null), departedAt: iso(p?.departed_at ?? null), offlineDelivery: p?.offline_delivery ?? false };
            }),
          };
        }),
    };
  }

  /** The planned trip, if the caller drives it (a dispatcher may act for any driver). */
  static async drivenTrip(tripId: string, user: AccessTokenPayload | undefined): Promise<PlannedTrip> {
    const trip: PlannedTrip = await planningJson(`/api/planning/trips/${encodeURIComponent(tripId)}`);
    if (user?.role === 'driver' && trip.vehicleId !== user.vehicle_id) {
      throw new HttpError(403, `Trip ${tripId} is not on your vehicle`);
    }
    return trip;
  }

  /** The driver pressed "Start Trip". Idempotent: a second press keeps the first time. */
  static async startDriverTrip(tripId: string, user: AccessTokenPayload | undefined) {
    const trip = await ExecutionSyncService.drivenTrip(tripId, user);
    const started = await pool.query('SELECT 1 FROM driver_trip_progress WHERE trip_id = $1', [tripId]);
    if (started.rowCount === 0 && trip.tripNumber > 1) await ExecutionSyncService.requireEarlierTripsDone(trip);
    const { rows } = await pool.query<{ started_at: Date; depot_arrived_at: Date | null }>(
      `INSERT INTO driver_trip_progress (trip_id, vehicle_id, driver_id) VALUES ($1, $2, $3)
       ON CONFLICT (trip_id) DO UPDATE SET trip_id = EXCLUDED.trip_id
       RETURNING started_at, depot_arrived_at`,
      [tripId, trip.vehicleId, user?.role === 'driver' ? user.userId ?? null : null],
    );
    return { tripId, driverStartedAt: rows[0].started_at.toISOString(), depotArrivedAt: rows[0].depot_arrived_at?.toISOString() ?? null };
  }

  /**
   * A vehicle runs its trips in order: trip 2 starts only once the driver has left every outlet
   * of trip 1 (the last step recorded for a trip). Otherwise a 409 that says how many are left.
   */
  static async requireEarlierTripsDone(trip: PlannedTrip) {
    const params = new URLSearchParams({ date: trip.planDate, vehicleId: trip.vehicleId });
    const day: PlannedTrip[] = await planningJson(`/api/planning/trips?${params}`);
    for (const earlier of day.filter((t) => t.tripNumber < trip.tripNumber).sort((a, b) => a.tripNumber - b.tripNumber)) {
      const { rows } = await pool.query<{ stop_id: string }>(
        'SELECT stop_id FROM stop_progress WHERE trip_id = $1 AND departed_at IS NOT NULL',
        [earlier.tripId],
      );
      const done = new Set(rows.map((r) => r.stop_id));
      const left = earlier.stops.filter((s) => !done.has(s.stopId)).length;
      if (left > 0) {
        throw new HttpError(409, `Finish trip ${earlier.tripNumber} first: ${left} of its ${earlier.stops.length} outlets are not done yet`, {
          tripId: earlier.tripId,
          outletsLeft: left,
        });
      }
    }
  }

  /**
   * Arrivals at and departures from the trip's stops, sent as they happen or queued on the phone
   * while it had no signal. Every time keeps the earliest one captured, so a late or repeated event
   * changes nothing. An arrival tells the outlet's store manager the truck is there (once per stop:
   * the alert id comes from the stop and the trip's departure from the depot). A stop that is not on the trip is a 400 (the phone drops that event). The depot
   * is not a stop here: arriving and leaving there go through the loaders, so they need signal.
   */
  static async recordStopEvents(events: StopEventInput[], user: AccessTokenPayload | undefined) {
    const trips = new Map<string, PlannedTrip>();
    for (const e of events) {
      if (!trips.has(e.tripId)) trips.set(e.tripId, await ExecutionSyncService.drivenTrip(e.tripId, user));
      if (!trips.get(e.tripId)!.stops.some((s) => s.stopId === e.stopId)) {
        throw new HttpError(400, `${e.stopId} is not a stop of ${e.tripId}`);
      }
    }
    const driverId = user?.role === 'driver' ? user.userId ?? null : null;
    for (const e of events) {
      const at = occurredAt(e.capturedAt);
      const column = e.type === 'arrival' ? 'arrived_at' : 'departed_at';
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const trip = trips.get(e.tripId)!;
        const stop = trip.stops.find((s) => s.stopId === e.stopId)!;
        await client.query(
          `INSERT INTO stop_progress (stop_id, trip_id, driver_id, ${column}, offline_delivery, order_ref, outlet_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (stop_id) DO UPDATE SET ${column} = LEAST(stop_progress.${column}, EXCLUDED.${column}),
             offline_delivery = stop_progress.offline_delivery OR EXCLUDED.offline_delivery,
             order_ref = EXCLUDED.order_ref, outlet_id = EXCLUDED.outlet_id, updated_at = CURRENT_TIMESTAMP`,
          [e.stopId, e.tripId, driverId, at, e.type === 'departure' && !!e.offline, stop.orderRef, stop.outletId],
        );
        if (e.type === 'arrival') {
          // One alert per stop and departure from the depot (a trip leaves once, unless it is reset).
          const left = await client.query<{ depot_departed_at: Date | null }>(
            'SELECT depot_departed_at FROM driver_trip_progress WHERE trip_id = $1',
            [e.tripId],
          );
          await enqueueAlert(client, {
            id: stableUuid(`arrival:${e.stopId}:${left.rows[0]?.depot_departed_at?.toISOString() ?? ''}`),
            type: 'driver.arrived',
            sourceRole: 'driver',
            ...actorOf(user),
            depot: trip.depot,
            outletId: stop.outletId,
            vehicleId: trip.vehicleId,
            tripId: e.tripId,
            orderRef: stop.orderRef,
            summary: `${trip.vehicleId} has arrived`,
            detail: `${trip.vehicleId} has arrived with order ${stop.orderRef}. Start unloading, then give the driver the handover code.`,
            payload: { stopId: e.stopId },
            occurredAt: at,
          });
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }
    return { accepted: events.map((e) => e.clientEventId) };
  }

  /**
   * The driver leaves the depot. Only once the loaders have released the truck (every unit of every
   * order scanned or reported, then dispatched); before that it is a 409. Every order that went on
   * the truck becomes out_for_delivery in Order Management (as the driver, so its history says who);
   * calling again re-sends any that Order Management did not accept.
   */
  static async departFromDepot(tripId: string, user: AccessTokenPayload | undefined, bearer?: string) {
    const trip = await ExecutionSyncService.drivenTrip(tripId, user);
    const state = (await tripStates([tripId])).get(tripId)!;
    if (!state.depotArrivedAt) throw new HttpError(409, `Check in at the depot before leaving on trip ${tripId}`);
    if (state.manifest !== 'completed') {
      throw new HttpError(409, `${trip.vehicleId} is not loaded yet; wait for the loader to release the truck`);
    }
    const { rows } = await pool.query<{ depot_departed_at: Date }>(
      `UPDATE driver_trip_progress SET depot_departed_at = COALESCE(depot_departed_at, CURRENT_TIMESTAMP)
       WHERE trip_id = $1 RETURNING depot_departed_at`,
      [tripId],
    );
    const loaded = await pool.query<{ order_ref: string }>(
      'SELECT order_ref FROM loaded_orders WHERE trip_id = $1 AND synced_at IS NOT NULL ORDER BY order_ref',
      [tripId],
    );
    const pending: string[] = [];
    for (const { order_ref } of loaded.rows) {
      if (!(await markOutForDelivery(order_ref, trip.depot, user?.role === 'driver' ? bearer : undefined))) pending.push(order_ref);
    }
    return { tripId, depotDepartedAt: rows[0].depot_departed_at.toISOString(), ordersNotUpdated: pending };
  }

  /**
   * The driver marked "I've Arrived" at the depot: the trip joins the loaders' Ready to Load queue.
   * The trip must have been started first. Idempotent: a second press keeps the first time.
   */
  static async arriveAtDepot(tripId: string, user: AccessTokenPayload | undefined) {
    await ExecutionSyncService.drivenTrip(tripId, user);
    const { rows } = await pool.query<{ started_at: Date; depot_arrived_at: Date }>(
      `UPDATE driver_trip_progress SET depot_arrived_at = COALESCE(depot_arrived_at, CURRENT_TIMESTAMP)
       WHERE trip_id = $1 RETURNING started_at, depot_arrived_at`,
      [tripId],
    );
    if (rows.length === 0) throw new HttpError(409, `Start trip ${tripId} before marking arrival at the depot`);
    const state = statusOf((await tripStates([tripId])).get(tripId));
    return { tripId, driverStartedAt: rows[0].started_at.toISOString(), depotArrivedAt: rows[0].depot_arrived_at.toISOString(), loadingStatus: state };
  }

  /**
   * The planned trip, if the caller may work on it: a loader only on the vehicles assigned to them.
   */
  static async assignedTrip(tripId: string, user: AccessTokenPayload | undefined): Promise<PlannedTrip> {
    const trip: PlannedTrip = await planningJson(`/api/planning/trips/${encodeURIComponent(tripId)}`);
    if (user?.role === 'loader' && trip.loaderId !== user.userId) {
      throw new HttpError(403, `Trip ${tripId} is not assigned to you`);
    }
    return trip;
  }

  /**
   * The trip's stops reversed for Last-In, First-Out loading: the last delivery is loaded first.
   */
  static async getLIFOManifest(tripId: string, user: AccessTokenPayload | undefined) {
    const trip = await ExecutionSyncService.assignedTrip(tripId, user);
    const progress = new Map((await LoadingService.progress(trip)).map((o) => [o.orderRef, o]));
    const rawStops = trip.stops;
    const lifoStops = [...rawStops].reverse().map((stop, index) => {
      const p = progress.get(stop.orderRef)!;
      return {
        loadingSequence: index + 1,
        unloadingSequence: rawStops.length - index,
        ...stop,
        // Each line with its scanned / missing / damaged / remaining units.
        items: p.lines,
        complete: p.complete,
        loaded: p.loaded,
      };
    });

    const state = (await tripStates([trip.tripId])).get(trip.tripId);
    return {
      tripId: trip.tripId,
      vehicleId: trip.vehicleId,
      depot: trip.depot,
      departureTime: trip.departureTime,
      status: statusOf(state),
      loaderId: trip.loaderId ?? null,
      loaderName: trip.loaderName ?? null,
      loadingStrategy: 'LIFO',
      totalStops: rawStops.length,
      stops: lifoStops,
    };
  }

  /**
   * Logs a single telemetry GPS entry
   */
  static async recordTelemetry(driverId?: string, vehicleId?: string, lat?: number, lng?: number, speed?: number, recordedAt?: string) {
    const query = `
      INSERT INTO telemetry_logs (driver_id, vehicle_id, latitude, longitude, speed, recorded_at)
      VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, CURRENT_TIMESTAMP))
      RETURNING *;
    `;
    const values = [driverId || null, vehicleId || null, lat, lng, speed || null, recordedAt || null];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Records Proof of Delivery (POD)
   */
  static async recordPod(stopId: string, podData: PodInput, driverId?: string, authorization?: string) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Record stop completion
      const stopQuery = `
        INSERT INTO stop_executions (stop_id, route_id, status, notes, completed_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        RETURNING *;
      `;
      const stopRes = await client.query(stopQuery, [
        stopId,
        podData.routeId || 'ROUTE-DEFAULT',
        podData.status,
        podData.notes || null,
      ]);

      // Record delivery event
      const eventQuery = `
        INSERT INTO delivery_events (
          order_ref, outlet_id, actual_arrival_time, actual_service_duration_min,
          actual_departure_time, status, pod_signature, offline_captured_at, synced_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (order_ref) DO UPDATE SET
          status = EXCLUDED.status,
          pod_signature = EXCLUDED.pod_signature,
          synced_at = CURRENT_TIMESTAMP
        RETURNING *;
      `;
      const eventRes = await client.query(eventQuery, [
        podData.orderRef,
        podData.outletId || null,
        podData.actualArrivalTime || null,
        podData.actualServiceDurationMin || null,
        podData.actualDepartureTime || null,
        podData.status,
        podData.podSignature,
      ]);

      await client.query('COMMIT');

      notifyOrderStatus(podData.orderRef, podData.status, authorization);

      return { stopExecution: stopRes.rows[0], deliveryEvent: eventRes.rows[0] };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Offline Bulk Sync Engine with Timestamp-based Conflict Resolution
   */
  static async processBulkSync(bulkData: BulkSyncInput, user?: AccessTokenPayload, authorization?: string) {
    const driverId = user?.userId;
    const syncedEvents: any[] = [];
    const syncedTelemetryCount: number = bulkData.telemetry?.length || 0;

    // 1. Process Telemetry Logs
    if (bulkData.telemetry && bulkData.telemetry.length > 0) {
      for (const t of bulkData.telemetry) {
        await this.recordTelemetry(driverId || t.driverId, t.vehicleId, t.lat, t.lng, t.speed, t.recordedAt);
      }
    }

    // 2. Process Delivery Events with Deterministic Conflict Resolution
    if (bulkData.events && bulkData.events.length > 0) {
      for (const event of bulkData.events) {
        const query = `
          INSERT INTO delivery_events (
            trip_id, order_ref, outlet_id, actual_arrival_time, actual_service_duration_min,
            actual_departure_time, status, pod_signature, offline_captured_at, synced_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
          ON CONFLICT (order_ref) DO UPDATE SET
            status = EXCLUDED.status,
            pod_signature = COALESCE(EXCLUDED.pod_signature, delivery_events.pod_signature),
            actual_arrival_time = COALESCE(EXCLUDED.actual_arrival_time, delivery_events.actual_arrival_time),
            actual_departure_time = COALESCE(EXCLUDED.actual_departure_time, delivery_events.actual_departure_time),
            offline_captured_at = EXCLUDED.offline_captured_at,
            synced_at = CURRENT_TIMESTAMP
          WHERE EXCLUDED.offline_captured_at >= delivery_events.offline_captured_at
          RETURNING *;
        `;

        const values = [
          event.tripId || null,
          event.orderRef,
          event.outletId || null,
          event.actualArrivalTime || null,
          event.actualServiceDurationMin || null,
          event.actualDepartureTime || null,
          event.status,
          event.podSignature || null,
          event.offlineCapturedAt,
        ];

        // Everything arriving through /sync was captured offline, so the dispatcher hears about it:
        // that delivery was never confirmed with the store's handover code.
        const client = await pool.connect();
        let row: any;
        try {
          await client.query('BEGIN');
          const res = await client.query(query, values);
          row = res.rows[0];
          if (row) {
            await enqueueAlert(client, {
              id: row.id,
              type: 'driver.offline_delivery',
              sourceRole: 'driver',
              ...actorOf(user),
              outletId: event.outletId || null,
              vehicleId: null,
              tripId: event.tripId || null,
              orderRef: event.orderRef,
              summary: `${OFFLINE_DELIVERY_LABEL[event.status] || event.status}${event.outletId ? ` at ${event.outletId}` : ''}`,
              detail: `${event.orderRef} was recorded as ${event.status.replace('_', ' ')} without network, using photo proof instead of the store's handover code.`,
              payload: { status: event.status, actualArrivalTime: event.actualArrivalTime || null },
              occurredAt: occurredAt(event.actualArrivalTime || event.offlineCapturedAt),
            });
          }
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
        if (row) {
          syncedEvents.push(row);
          notifyOrderStatus(event.orderRef, event.status, authorization);
        }
      }
    }

    // 3. Optional Fleet Log Distance Trigger
    const vehicleIds = Array.from(new Set((bulkData.telemetry || []).map((t: { vehicleId?: string }) => t.vehicleId).filter(Boolean)));
    for (const vId of vehicleIds) {
      safeFetch(`${FLEET_SERVICE_URL}/api/fleet/vehicles/${vId}/log-distance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distanceKm: 25.0, syncedAt: new Date().toISOString() }),
      });
    }

    if (syncedEvents.length > 0) void relayPendingAlerts();

    return {
      syncedEventsCount: syncedEvents.length,
      syncedTelemetryCount,
      events: syncedEvents,
    };
  }

  /**
   * Store manager taps Confirm Receipt: issue the handover code the driver must enter.
   * Needs unloading to have started and the order to still be out for delivery. A repeat call
   * while the code is valid returns the same code; an expired or locked code is replaced.
   */
  static async confirmOrder(orderRef: string, authorization: string | undefined) {
    const order = await fetchOrder(orderRef, authorization);
    if (order?.status === 'delivered') {
      throw new ExecutionError(409, 'ALREADY_DELIVERED', `The driver has already completed ${orderRef}; record the receipt directly`, { status: order.status });
    }
    if (order?.status !== 'out_for_delivery') {
      throw new ExecutionError(409, 'INVALID_STATE', `A handover code can only be issued while the order is out for delivery; ${orderRef} is '${order?.status}'`, { status: order?.status });
    }
    const unloading = await pool.query('SELECT 1 FROM store_unloadings WHERE order_ref = $1', [orderRef]);
    if (unloading.rows.length === 0) {
      throw new ExecutionError(409, 'UNLOADING_NOT_STARTED', 'Start unloading before confirming receipt');
    }

    const existing = (await pool.query('SELECT * FROM handover_codes WHERE order_ref = $1', [orderRef])).rows[0];
    const reusable = existing && !existing.used_at && new Date(existing.expires_at) > new Date() && existing.attempts < HANDOVER_MAX_ATTEMPTS;
    let row = existing;
    if (!reusable) {
      row = (await pool.query(
        `INSERT INTO handover_codes (order_ref, outlet_id, nonce, expires_at, attempts, used_at)
         VALUES ($1, $2, $3, now() + ($4 || ' seconds')::interval, 0, NULL)
         ON CONFLICT (order_ref) DO UPDATE
           SET nonce = EXCLUDED.nonce, expires_at = EXCLUDED.expires_at, attempts = 0, used_at = NULL
         RETURNING *`,
        [orderRef, order.outlet_id, randomUUID(), String(HANDOVER_TTL_SECONDS)],
      )).rows[0];
    }
    return { orderRef, deliveryId: orderRef, code: handoverCode(orderRef, row.nonce), expiresAt: row.expires_at };
  }

  /**
   * Driver enters the code at the outlet. A correct code marks the order delivered using the
   * driver's own token. Every try counts, and the code locks after too many wrong ones.
   */
  static async completeHandover(orderRef: string, code: string, authorization: string | undefined) {
    const attempt = await pool.query(
      `UPDATE handover_codes SET attempts = attempts + 1
        WHERE order_ref = $1 AND used_at IS NULL AND expires_at > now() AND attempts < $2
        RETURNING nonce, outlet_id, attempts`,
      [orderRef, HANDOVER_MAX_ATTEMPTS],
    );
    if (attempt.rows.length === 0) {
      const row = (await pool.query('SELECT used_at, expires_at, attempts FROM handover_codes WHERE order_ref = $1', [orderRef])).rows[0];
      if (!row || row.used_at) throw new ExecutionError(404, 'NO_ACTIVE_CODE', 'There is no active handover code for this order');
      if (new Date(row.expires_at) <= new Date()) throw new ExecutionError(410, 'CODE_EXPIRED', 'The handover code has expired; ask the store for a new one');
      throw new ExecutionError(429, 'CODE_LOCKED', 'Too many wrong codes; ask the store for a new one');
    }

    const { nonce, outlet_id: outletId, attempts } = attempt.rows[0];
    const expected = Buffer.from(handoverCode(orderRef, nonce));
    const given = Buffer.from(code);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new ExecutionError(400, 'INVALID_CODE', 'That code is not correct', { attemptsLeft: HANDOVER_MAX_ATTEMPTS - attempts });
    }

    const res = await safeFetch(`${ORDER_SERVICE_URL}/api/orders/${encodeURIComponent(orderRef)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
      body: JSON.stringify({ status: 'delivered' }),
    });
    if (!res) throw new ExecutionError(502, 'ORDER_SERVICE_UNAVAILABLE', 'Order Management is unreachable');
    if (!res.ok) {
      const body: any = await res.json().catch(() => null);
      throw new ExecutionError(res.status, body?.error?.code || 'ORDER_UPDATE_FAILED', body?.error?.message || `Order update failed (${res.status})`, body?.error?.details);
    }

    await pool.query('UPDATE handover_codes SET used_at = now() WHERE order_ref = $1', [orderRef]);
    await pool.query(
      `INSERT INTO delivery_events (order_ref, outlet_id, status, pod_signature, offline_captured_at)
       VALUES ($1, $2, 'delivered', 'handover-code', now())
       ON CONFLICT (order_ref) DO UPDATE SET status = 'delivered', pod_signature = 'handover-code', synced_at = now()`,
      [orderRef, outletId],
    );
    return { orderRef, status: 'delivered', deliveredAt: new Date().toISOString() };
  }

  /**
   * Driver incident reports. Each carries the id the device gave it, so a backlog flushed after an
   * outage (or a retry whose response was lost) only stores and alerts once per report.
   */
  static async recordDriverIncidents(incidents: DriverIncidentInput[], user?: AccessTokenPayload) {
    const accepted: string[] = [];
    const duplicates: string[] = [];
    const actor = actorOf(user);
    for (const incident of incidents) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const res = await client.query(
          `INSERT INTO driver_incidents (
             id, driver_id, driver_username, depot, trip_id, stop_id, outlet_id, order_ref, vehicle_id,
             issue, action, notes, captured_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (id) DO NOTHING
           RETURNING id`,
          [
            incident.clientEventId, actor.actorId, actor.actorName, actor.depot, incident.tripId || null,
            incident.stopId || null, incident.outletId || null, incident.orderRef || null, incident.vehicleId || null,
            incident.issue, incident.action || null, incident.notes || null, incident.capturedAt,
          ],
        );
        if (res.rows.length > 0) {
          const issue = ISSUE_LABEL[incident.issue];
          const action = incident.action ? ACTION_LABEL[incident.action] || incident.action : null;
          await enqueueAlert(client, {
            id: incident.clientEventId,
            type: 'driver.incident',
            sourceRole: 'driver',
            ...actor,
            outletId: incident.outletId || null,
            vehicleId: incident.vehicleId || null,
            tripId: incident.tripId || null,
            orderRef: incident.orderRef || null,
            summary: `${issue}${incident.outletId ? ` at ${incident.outletId}` : ''}`,
            detail: [
              `${issue}${incident.outletId ? ` at ${incident.outletId}` : ''}${incident.tripId ? ` (${incident.tripId})` : ''}.`,
              action ? `Driver: ${action}.` : '',
              incident.notes ? `Notes: ${incident.notes}` : '',
            ].filter(Boolean).join(' '),
            payload: { issue: incident.issue, action: incident.action || null, stopId: incident.stopId || null },
            occurredAt: occurredAt(incident.capturedAt),
          });
          accepted.push(incident.clientEventId);
        } else {
          duplicates.push(incident.clientEventId);
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }
    if (accepted.length > 0) void relayPendingAlerts();
    return { accepted, duplicates };
  }

  /**
   * Store manager reports a problem with a delivery that is still on the way (late, unreachable driver...).
   * The outlet always comes from the token.
   */
  static async reportDeliveryProblem(deliveryId: string, input: DeliveryProblemInput, user?: AccessTokenPayload) {
    const outletId = user?.outlet_id || null;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query(
        `INSERT INTO delivery_problems (delivery_id, order_ref, outlet_id, store_manager_id, problems)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [deliveryId, input.orderRef || null, outletId, user?.userId || null, JSON.stringify(input.problems)],
      );
      const id: string = res.rows[0].id;
      await enqueueAlert(client, {
        id,
        type: 'store.delivery_problem',
        sourceRole: 'store_manager',
        ...actorOf(user),
        outletId,
        vehicleId: null,
        tripId: null,
        orderRef: input.orderRef || null,
        summary: input.problems.join(', '),
        detail: `${outletId || 'The store'} reported a problem with delivery ${input.orderRef || deliveryId}: ${input.problems.join('; ')}.`,
        payload: { deliveryId, problems: input.problems },
        occurredAt: new Date().toISOString(),
      });
      await client.query('COMMIT');
      void relayPendingAlerts();
      return { id };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
