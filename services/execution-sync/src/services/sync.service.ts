import jwt from 'jsonwebtoken';
import { pool } from '../db/pool';
import { BulkSyncInput, DeliveryProblemInput, DriverIncidentInput, PodInput, ShortfallInput } from '../schemas/execution.schema';
import { AccessTokenPayload } from '../middleware/auth';
import { enqueueAlert, relayPendingAlerts } from './alertOutbox';

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

export class ExecutionSyncService {
  /**
   * Get active trips for a depot — filtered by loading status
   */
  static async getActiveTrips(depot: string, status?: string) {
    // Fetch vehicles from fleet-directory for this depot
    const fleetUrl = `${FLEET_SERVICE_URL}/api/fleet/vehicles?depot=${encodeURIComponent(depot)}`;
    const fleetResponse = await safeFetch(fleetUrl);

    let vehicles: any[] = [];
    if (fleetResponse && fleetResponse.ok) {
      const fleetData = await fleetResponse.json();
      vehicles = fleetData.data || [];
    }

    // Determine how many vehicles to allocate per status
    const totalAvailable = vehicles.filter((v: any) => v.status === 'available').length;
    const perStatus = Math.max(1, Math.floor(totalAvailable / 3));

    // Map to active trips format for the loader app
    const allTrips = vehicles
      .filter((v: any) => v.status === 'available')
      .map((v: any) => ({
        tripId: `TRIP-${v.vehicle_id}`,
        vehicleId: v.vehicle_id,
        vehicleType: v.type,
        temperature: v.temp === 'reefer' ? 'frozen' : 'ambient',
        arrivalTime: '04:00 AM',
        stops: 0,
        status: 'ready_to_load',
        dock: v.depot,
      }));

    // Filter by status
    if (status === 'ready_to_load') {
      return allTrips.slice(0, perStatus);
    } else if (status === 'loading') {
      return allTrips.slice(perStatus, perStatus * 2).map((t) => ({ ...t, status: 'loading' }));
    } else if (status === 'completed') {
      return allTrips.slice(perStatus * 2, perStatus * 3).map((t) => ({ ...t, status: 'completed' }));
    }

    return allTrips.slice(0, 10);
  }

  /**
   * Fetches assigned trip from planning-allocation microservice and reverses stop order for LIFO loading
   */
  static async getLIFOManifest(tripId: string) {
    const url = `${PLANNING_SERVICE_URL}/api/planning/trips/${tripId}`;
    const response = await safeFetch(url);

    let tripData: any = null;
    if (response && response.ok) {
      tripData = await response.json();
    } else {
      // Fallback mock structure if planning-allocation service is unreachable or in stub mode
      tripData = {
        tripId,
        vehicleId: 'VEH-101',
        depot: 'Colombo Central Depot',
        stops: [
          { stopNumber: 1, outletId: 'OUTLET-001', orderRef: 'ORD-1001', items: [{ sku: 'SKU-A', qty: 10 }] },
          { stopNumber: 2, outletId: 'OUTLET-002', orderRef: 'ORD-1002', items: [{ sku: 'SKU-B', qty: 15 }] },
          { stopNumber: 3, outletId: 'OUTLET-003', orderRef: 'ORD-1003', items: [{ sku: 'SKU-C', qty: 5 }] },
        ],
      };
    }

    // Reverse the stop list for Last-In, First-Out (LIFO) loading sequence
    const rawStops = tripData.stops || tripData.data?.stops || [];
    const lifoStops = [...rawStops].reverse().map((stop, index) => ({
      loadingSequence: index + 1,
      unloadingSequence: rawStops.length - index,
      ...stop,
    }));

    return {
      tripId: tripData.tripId || tripId,
      vehicleId: tripData.vehicleId,
      depot: tripData.depot,
      loadingStrategy: 'LIFO',
      totalStops: rawStops.length,
      stops: lifoStops,
    };
  }

  /**
   * Records a loading shortfall/damage entry
   */
  static async recordShortfall(tripId: string, shortfall: ShortfallInput) {
    const query = `
      INSERT INTO loading_shortfalls (trip_id, order_ref, sku, missing_qty, damage_flag, notes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const values = [
      tripId,
      shortfall.orderRef,
      shortfall.sku,
      shortfall.missingQty,
      shortfall.damageFlag,
      shortfall.notes || null,
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Completes warehouse loading manifest dispatch
   */
  static async completeDispatch(tripId: string, loaderId?: string) {
    const query = `
      INSERT INTO loading_manifests (trip_id, loader_id, status, completed_at)
      VALUES ($1, $2, 'completed', CURRENT_TIMESTAMP)
      ON CONFLICT (trip_id) DO UPDATE 
        SET status = 'completed', completed_at = CURRENT_TIMESTAMP, loader_id = EXCLUDED.loader_id
      RETURNING *;
    `;
    const result = await pool.query(query, [tripId, loaderId || null]);
    return result.rows[0];
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
