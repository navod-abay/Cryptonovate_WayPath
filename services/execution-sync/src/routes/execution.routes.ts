import { Router } from 'express';
import { ExecutionController } from '../controllers/execution.controller';
import { authenticateJwt, enforceOutletScope, requireRole } from '../middleware/auth';

const router = Router();

// ============================================================================
// A. WAREHOUSE LOADING ROUTES (Role: loader, dispatcher)
// ============================================================================
router.get(
  '/docks/:depot/active-trips',
  authenticateJwt,
  requireRole('loader', 'dispatcher'),
  ExecutionController.getActiveTrips
);

router.get(
  '/trips/:tripId/manifest',
  authenticateJwt,
  requireRole('loader', 'dispatcher'),
  ExecutionController.getManifest
);

router.post(
  '/trips/:tripId/shortfall',
  authenticateJwt,
  requireRole('loader', 'dispatcher'),
  ExecutionController.recordShortfall
);

router.post(
  '/trips/:tripId/dispatch',
  authenticateJwt,
  requireRole('loader', 'dispatcher'),
  ExecutionController.completeDispatch
);

// ============================================================================
// B. DRIVER EXECUTION, TELEMETRY & INCIDENT ROUTES (Role: driver, dispatcher)
// ============================================================================
router.get(
  '/driver/active-route',
  authenticateJwt,
  requireRole('driver', 'dispatcher'),
  ExecutionController.getActiveRoute
);

// Note: /telemetry allows unauthenticated or authenticated driver updates
router.post(
  '/telemetry',
  ExecutionController.recordTelemetry
);

router.post(
  '/stops/:stopId/pod',
  authenticateJwt,
  requireRole('driver', 'dispatcher'),
  ExecutionController.recordPod
);

router.post(
  '/driver/incidents',
  authenticateJwt,
  requireRole('driver'),
  ExecutionController.reportDriverIncidents
);

// ============================================================================
// C. OFFLINE BULK SYNCHRONIZATION ROUTE (Role: driver, dispatcher)
// ============================================================================
router.post(
  '/sync',
  authenticateJwt,
  requireRole('driver', 'dispatcher'),
  ExecutionController.bulkSync
);

// ============================================================================
// D. STORE MANAGER CONFIRMATION & DELIVERY PROBLEM ROUTES (Role: store_manager, dispatcher)
// ============================================================================
router.post(
  '/orders/:orderRef/unloading',
  authenticateJwt,
  requireRole('store_manager', 'dispatcher'),
  ExecutionController.startUnloading
);

router.get(
  '/outlets/:outletId/unloadings',
  authenticateJwt,
  requireRole('store_manager', 'dispatcher'),
  enforceOutletScope('outletId'),
  ExecutionController.listUnloadings
);

router.post(
  '/orders/:orderRef/confirm',
  authenticateJwt,
  requireRole('store_manager'),
  ExecutionController.confirmOrder
);

router.post(
  '/orders/:orderRef/handover',
  authenticateJwt,
  requireRole('driver'),
  ExecutionController.handover
);

router.post(
  '/deliveries/:deliveryId/problems',
  authenticateJwt,
  requireRole('store_manager'),
  ExecutionController.reportDeliveryProblem
);

export default router;
