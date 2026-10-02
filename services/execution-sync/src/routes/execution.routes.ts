import { Router } from 'express';
import { ExecutionController } from '../controllers/execution.controller';
import { authenticateJwt, requireRole } from '../middleware/auth';

const router = Router();

// ============================================================================
// A. WAREHOUSE LOADING ROUTES (Role: loader, dispatcher)
// ============================================================================
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
// B. DRIVER EXECUTION & TELEMETRY ROUTES (Role: driver, dispatcher)
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
// D. STORE MANAGER CONFIRMATION & DISPUTE ROUTES (Role: store_manager, dispatcher)
// ============================================================================
router.post(
  '/orders/:orderRef/confirm',
  authenticateJwt,
  requireRole('store_manager', 'dispatcher'),
  ExecutionController.confirmOrder
);

router.post(
  '/orders/:orderRef/dispute',
  authenticateJwt,
  requireRole('store_manager', 'dispatcher'),
  ExecutionController.disputeOrder
);

export default router;
