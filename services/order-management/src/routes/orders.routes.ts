import { Router } from 'express';
import { env } from '../config/env.js';
import * as ctrl from '../controllers/orders.controller.js';
import { pingDatabase } from '../db/pool.js';
import { requireRole, verifyToken } from '../middleware/authGuard.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveCreateOutlet } from '../middleware/outletScope.js';
import { validateQuery, validateRequest } from '../middleware/validate.js';
import {
  AtRiskQuerySchema,
  CancelOrderSchema,
  CloseWindowSchema,
  ConfirmedQuerySchema,
  ConfirmOrderSchema,
  CreateOrderSchema,
  DeferOrderSchema,
  ListOrdersQuerySchema,
  ReceiptSchema,
  ReplaceItemsSchema,
  StatusBatchSchema,
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
      timestamp: new Date().toISOString(),
    });
  }),
);

// ----------------------------------------------------------------- authenticated
router.use(verifyToken(env.JWT_ACCESS_SECRET));

const dispatcher = requireRole(['dispatcher']);
const orderWriters = requireRole(['store_manager', 'dispatcher']);
const orderReaders = requireRole(['store_manager', 'dispatcher', 'loader']);

// Literal paths MUST be registered before '/:order_ref' or Express treats them as refs.
router.get('/confirmed', requireRole(['dispatcher', 'loader']), validateQuery(ConfirmedQuerySchema), asyncHandler(ctrl.getConfirmed));
router.get('/at-risk', dispatcher, validateQuery(AtRiskQuerySchema), asyncHandler(ctrl.getAtRisk));
router.get('/summary', dispatcher, validateQuery(SummaryQuerySchema), asyncHandler(ctrl.getSummary));
router.patch('/status-batch', dispatcher, validateRequest(StatusBatchSchema), asyncHandler(ctrl.statusBatch));
router.post('/close-window', dispatcher, validateRequest(CloseWindowSchema), asyncHandler(ctrl.closeWindow));

router.get('/', orderReaders, validateQuery(ListOrdersQuerySchema), asyncHandler(ctrl.listOrders));
router.post('/', orderWriters, resolveCreateOutlet, validateRequest(CreateOrderSchema), asyncHandler(ctrl.createOrder));

router.get('/:order_ref', orderReaders, asyncHandler(ctrl.getOrder));
router.delete('/:order_ref', orderWriters, validateRequest(CancelOrderSchema), asyncHandler(ctrl.cancelOrder));
router.put('/:order_ref/items', orderWriters, validateRequest(ReplaceItemsSchema), asyncHandler(ctrl.replaceItems));
router.post('/:order_ref/confirm', orderWriters, validateRequest(ConfirmOrderSchema), asyncHandler(ctrl.confirmOrder));
router.get('/:order_ref/history', orderWriters, asyncHandler(ctrl.getHistory));
router.post('/:order_ref/defer', dispatcher, validateRequest(DeferOrderSchema), asyncHandler(ctrl.deferOrder));
router.post('/:order_ref/receipt', requireRole(['store_manager']), validateRequest(ReceiptSchema), asyncHandler(ctrl.recordReceipt));

export default router;
