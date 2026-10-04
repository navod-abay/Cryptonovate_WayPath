import jwt from 'jsonwebtoken';
import { pool } from '../db/pool';
import { BulkSyncInput, DeliveryProblemInput, DriverIncidentInput, PodInput } from '../schemas/execution.schema';
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

/**
 * Order Management only knows order statuses. A full or partial drop-off is a delivered order;
 * a rejected stop leaves the order where it is (the dispatcher decides what happens next).
 */
const ORDER_STATUS_FOR: Record<string, 'delivered' | undefined> = {
  delivered: 'delivered',
  partially_delivered: 'delivered',
  completed: 'delivered',
};

function notifyOrderStatus(orderRef: string, executionStatus: string) {
  const status = ORDER_STATUS_FOR[executionStatus];
  if (!status) return;
  safeFetch(`${ORDER_SERVICE_URL}/api/orders/${encodeURIComponent(orderRef)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  }).then((res) => {
    if (res && !res.ok) console.warn(`[sync.service] Order Management refused ${orderRef} -> ${status} (${res.status})`);
  });
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

function actorOf(user?: AccessTokenPayload) {
  return { actorId: user?.userId || null, actorName: user?.username || null, depot: user?.depot || null };
}

/** A failure the controller answers with this status instead of 500. */
export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
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
  stops: Array<{ orderRef: string; outletId: string; items: Array<{ sku: string; description: string; qty: number }> }>;
}

/** Calls Planning with a service token; its 404/403 pass through, anything else is a 502. */
async function planningJson<T>(path: string): Promise<T> {
  const res = await safeFetch(`${PLANNING_SERVICE_URL}${path}`);
  if (!res) throw new HttpError(502, 'Planning & Allocation is unreachable');
  const body = await res.json().catch(() => null);
  if (res.status === 404 || res.status === 403) throw new HttpError(res.status, body?.error || `Planning answered ${res.status}`);
  if (!res.ok) throw new HttpError(502, `Planning & Allocation answered ${res.status}: ${body?.error ?? ''}`.trim());
  return body as T;
}

/** Today in Colombo (YYYY-MM-DD): the plan date loaders work on. */
function colomboToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(now);
}

/** loading_manifests.status -> the loader app's queue: no row yet is ready to load. */
function loadingStatus(manifest?: string) {
  if (manifest === 'completed') return 'completed';
  if (manifest === 'in_progress') return 'loading';
  return 'ready_to_load';
}

export class ExecutionSyncService {
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

    const states = new Map<string, string>();
    if (trips.length > 0) {
      const { rows } = await pool.query<{ trip_id: string; status: string }>(
        'SELECT trip_id, status FROM loading_manifests WHERE trip_id = ANY($1)',
        [trips.map((t) => t.tripId)]
      );
      for (const r of rows) states.set(r.trip_id, r.status);
    }
    const queue = trips
      .map((t) => ({
        tripId: t.tripId,
        tripNumber: t.tripNumber,
        vehicleId: t.vehicleId,
        vehicleType: t.vehicleType,
        temperature: t.vehicleTemperature === 'reefer' ? 'frozen' : 'ambient',
        departureTime: t.departureTime,
        stops: t.stops.length,
        status: loadingStatus(states.get(t.tripId)),
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
    const { rows } = trips.length
      ? await pool.query<{ trip_id: string; status: string }>('SELECT trip_id, status FROM loading_manifests WHERE trip_id = ANY($1)', [
          trips.map((t) => t.tripId),
        ])
      : { rows: [] };
    const states = new Map(rows.map((r) => [r.trip_id, r.status]));
    return {
      date: day,
      vehicleId: vehicle,
      trips: trips
        .sort((a, b) => a.tripNumber - b.tripNumber)
        .map((t) => ({ ...t, loadingStatus: loadingStatus(states.get(t.tripId)) })),
    };
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

    const { rows } = await pool.query<{ status: string }>('SELECT status FROM loading_manifests WHERE trip_id = $1', [trip.tripId]);
    return {
      tripId: trip.tripId,
      vehicleId: trip.vehicleId,
      depot: trip.depot,
      departureTime: trip.departureTime,
      status: loadingStatus(rows[0]?.status),
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
  static async recordPod(stopId: string, podData: PodInput, driverId?: string) {
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

      notifyOrderStatus(podData.orderRef, podData.status);

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
  static async processBulkSync(bulkData: BulkSyncInput, user?: AccessTokenPayload) {
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
          notifyOrderStatus(event.orderRef, event.status);
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
   * Store Manager Order Receipt Confirmation
   */
  static async confirmOrder(orderRef: string, storeManagerId?: string, notes?: string) {
    // Notify Order Management microservice
    const res = await safeFetch(`${ORDER_SERVICE_URL}/api/orders/${orderRef}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'confirmed', confirmedBy: storeManagerId, notes }),
    });

    return {
      orderRef,
      status: 'confirmed',
      confirmedBy: storeManagerId || null,
      orderManagementNotified: res ? res.ok : false,
    };
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
