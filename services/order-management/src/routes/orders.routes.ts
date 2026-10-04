import { Router } from 'express';
import { env } from '../config/env.js';
import * as ctrl from '../controllers/orders.controller.js';
import { pingDatabase } from '../db/pool.js';
import { requireRole, verifyToken } from '../middleware/authGuard.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveCreateOutlet } from '../middleware/outletScope.js';
import { referenceDataStatus } from '../services/referenceData.js';
import { validateQuery, validateRequest } from '../middleware/validate.js';
import {
  AtRiskQuerySchema,
  CancelOrderSchema,
  CloseWindowSchema,
  SimulateDeliverySchema,
  ConfirmedQuerySchema,
  ConfirmOrderSchema,
  CreateOrderSchema,
  DeferOrderSchema,
  DispatcherOverviewQuerySchema,
  ListOrdersQuerySchema,
  ListProductsQuerySchema,
  OrderWindowsQuerySchema,
  ReceiptSchema,
  ReplaceItemsSchema,
  StatusBatchSchema,
  StatusChangeSchema,
  SummaryQuerySchema,
} from '../schemas/orders.schema.js';

const router = Router();

// ----------------------------------------------------------------- public
router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const dbUp = await pingDatabase();
    res.status(dbUp ? 200 : 503).json({
      service: 'order-management',
      status: dbUp ? 'healthy' : 'degraded',
      db: dbUp ? 'up' : 'down',
      // Informational: when outlets were last copied from Fleet & Directory's table.
      reference_data: referenceDataStatus(),
      timestamp: new Date().toISOString(),
    });
  }),
);

// ----------------------------------------------------------------- authenticated
router.use(verifyToken(env.JWT_ACCESS_SECRET));

const dispatcher = requireRole(['dispatcher']);
const orderWriters = requireRole(['store_manager', 'dispatcher']);
const orderReaders = requireRole(['store_manager', 'dispatcher', 'loader']);
// Planning & Allocation (role 'system') reads the pool and order lines, and writes allocations back.
const dispatcherOrPlanning = requireRole(['dispatcher', 'system']);

// Literal paths MUST be registered before '/:order_ref' or Express treats them as refs.
router.get('/confirmed', requireRole(['dispatcher', 'loader', 'system']), validateQuery(ConfirmedQuerySchema), asyncHandler(ctrl.getConfirmed));
router.get('/at-risk', dispatcher, validateQuery(AtRiskQuerySchema), asyncHandler(ctrl.getAtRisk));
router.get('/summary', dispatcher, validateQuery(SummaryQuerySchema), asyncHandler(ctrl.getSummary));
router.get('/products', requireRole(['store_manager', 'dispatcher']), validateQuery(ListProductsQuerySchema), asyncHandler(ctrl.listProducts));
router.get('/dispatcher/overview', dispatcher, validateQuery(DispatcherOverviewQuerySchema), asyncHandler(ctrl.getDispatcherOverview));
router.get('/dispatcher/windows', dispatcher, validateQuery(OrderWindowsQuerySchema), asyncHandler(ctrl.getOrderWindows));
router.patch('/status-batch', dispatcherOrPlanning, validateRequest(StatusBatchSchema), asyncHandler(ctrl.statusBatch));
router.post('/close-window', dispatcherOrPlanning, validateRequest(CloseWindowSchema), asyncHandler(ctrl.closeWindow));
// Demo history only (SEED_DEMO_DATA): Planning marks the past days it planned at startup as delivered and received.
router.post('/simulate-delivery', requireRole(['system']), validateRequest(SimulateDeliverySchema), asyncHandler(ctrl.simulateDelivery));

router.get('/', orderReaders, validateQuery(ListOrdersQuerySchema), asyncHandler(ctrl.listOrders));
router.post('/', orderWriters, resolveCreateOutlet, validateRequest(CreateOrderSchema), asyncHandler(ctrl.createOrder));

router.get('/:order_ref', requireRole(['store_manager', 'dispatcher', 'loader', 'system']), asyncHandler(ctrl.getOrder));
router.delete('/:order_ref', orderWriters, validateRequest(CancelOrderSchema), asyncHandler(ctrl.cancelOrder));
router.put('/:order_ref/items', orderWriters, validateRequest(ReplaceItemsSchema), asyncHandler(ctrl.replaceItems));
router.post('/:order_ref/confirm', orderWriters, validateRequest(ConfirmOrderSchema), asyncHandler(ctrl.confirmOrder));
router.get('/:order_ref/history', orderWriters, asyncHandler(ctrl.getHistory));
router.patch(
  '/:order_ref/status',
  // 'system' is Execution & Sync relaying loader and driver events.
  requireRole(['dispatcher', 'loader', 'driver', 'system']),
  validateRequest(StatusChangeSchema),
  asyncHandler(ctrl.changeStatus),
);
router.post('/:order_ref/defer', dispatcher, validateRequest(DeferOrderSchema), asyncHandler(ctrl.deferOrder));
router.post('/:order_ref/receipt', requireRole(['store_manager']), validateRequest(ReceiptSchema), asyncHandler(ctrl.recordReceipt));

export default router;
