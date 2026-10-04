import { pool } from '../db/pool';
import { BulkSyncInput, PodInput, ShortfallInput } from '../schemas/execution.schema';

const PLANNING_SERVICE_URL = process.env.PLANNING_SERVICE_URL || 'http://planning-allocation:5003';
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://order-management:5002';
const FLEET_SERVICE_URL = process.env.FLEET_SERVICE_URL || 'http://fleet-directory:5004';

// Helper for safe external REST calls with timeout
async function safeFetch(url: string, options: RequestInit = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    return res;
  } catch (err: any) {
    clearTimeout(timeout);
    console.warn(`[sync.service] External HTTP call to ${url} failed or timed out: ${err.message}`);
    return null;
  }
}

export class ExecutionSyncService {
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

      // Async notification to Order Management microservice
      safeFetch(`${ORDER_SERVICE_URL}/api/orders/${podData.orderRef}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: podData.status }),
      });

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
  static async processBulkSync(bulkData: BulkSyncInput, driverId?: string) {
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

        const res = await pool.query(query, values);
        if (res.rows.length > 0) {
          syncedEvents.push(res.rows[0]);

          // Trigger Order Management status update
          safeFetch(`${ORDER_SERVICE_URL}/api/orders/${event.orderRef}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: event.status }),
          });
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
   * Store Manager Order Dispute Registration
   */
  static async disputeOrder(orderRef: string, storeManagerId?: string, discrepancyType?: string, description?: string) {
    const query = `
      INSERT INTO delivery_disputes (order_ref, store_manager_id, discrepancy_type, description)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const res = await pool.query(query, [orderRef, storeManagerId || null, discrepancyType || 'general', description || '']);

    // Notify Order Management microservice
    safeFetch(`${ORDER_SERVICE_URL}/api/orders/${orderRef}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'disputed', discrepancyType }),
    });

    return res.rows[0];
  }
}
