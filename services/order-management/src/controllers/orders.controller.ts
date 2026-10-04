import { Request, Response } from 'express';
import { z } from 'zod';
import { isOperatingDay, nextOperatingDay } from '../domain/calendar.js';
import { nextRunDate } from '../domain/cutoff.js';
import { appError } from '../domain/errors.js';
import { actorFrom } from '../middleware/outletScope.js';
import type {
  AtRiskQuerySchema,
  CancelOrderSchema,
  CloseWindowSchema,
  ConfirmedQuerySchema,
  SimulateDeliveryInput,
  ConfirmOrderSchema,
  CreateOrderInput,
  DeferOrderSchema,
  ListOrdersQuery,
  ReceiptInput,
  StatusChangeInput,
  ReplaceItemsSchema,
  StatusBatchSchema,
  SummaryQuerySchema,
} from '../schemas/orders.schema.js';
import { runCutoffSweep } from '../services/cutoffJob.js';
import { simulateDelivery as simulateDeliveryForDay } from '../services/demoHistory.service.js';
import * as orders from '../services/orders.service.js';

const IDEMPOTENCY_KEY = /^[\x21-\x7E]{1,100}$/;

const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data });

function idempotencyKeyFrom(req: Request): string | null {
  const raw = req.header('Idempotency-Key');
  if (raw === undefined) return null;
  const key = raw.trim();
  if (!IDEMPOTENCY_KEY.test(key)) {
    throw appError('VALIDATION_ERROR', 'Idempotency-Key must be 1–100 printable ASCII characters without spaces');
  }
  return key;
}

const orderRefParam = (req: Request): string => req.params.order_ref;

export async function createOrder(req: Request, res: Response) {
  const { order, replayed } = await orders.createOrder(actorFrom(req), req.body as CreateOrderInput, idempotencyKeyFrom(req));
  ok(res, replayed ? { ...order, idempotent_replay: true } : order, replayed ? 200 : 201);
}

export async function replaceItems(req: Request, res: Response) {
  const body = req.body as z.infer<typeof ReplaceItemsSchema>;
  ok(res, await orders.replaceOrderItems(actorFrom(req), orderRefParam(req), body.items));
}

export async function confirmOrder(req: Request, res: Response) {
  const body = req.body as z.infer<typeof ConfirmOrderSchema>;
  const { order, rolledToNextRun } = await orders.confirmOrder(actorFrom(req), orderRefParam(req), body.accept_next_run);
  ok(res, { ...order, rolled_to_next_run: rolledToNextRun });
}

export async function cancelOrder(req: Request, res: Response) {
  const body = req.body as z.infer<typeof CancelOrderSchema>;
  ok(res, await orders.cancelOrder(actorFrom(req), orderRefParam(req), body.reason_note));
}

export async function listOrders(req: Request, res: Response) {
  ok(res, await orders.listOrders(actorFrom(req), req.query as unknown as ListOrdersQuery));
}

export async function getOrder(req: Request, res: Response) {
  ok(res, await orders.getOrder(actorFrom(req), orderRefParam(req)));
}

export async function getHistory(req: Request, res: Response) {
  ok(res, await orders.getOrderHistory(actorFrom(req), orderRefParam(req)));
}

export async function getConfirmed(req: Request, res: Response) {
  const q = req.query as unknown as z.infer<typeof ConfirmedQuerySchema>;
  ok(res, await orders.getConfirmedForPlanning(q.date, q.depot));
}

export async function getSummary(req: Request, res: Response) {
  const q = req.query as unknown as z.infer<typeof SummaryQuerySchema>;
  ok(res, await orders.getSummary(q.date, q.depot));
}

export async function getAtRisk(req: Request, res: Response) {
  const q = req.query as unknown as z.infer<typeof AtRiskQuerySchema>;
  ok(res, await orders.getAtRisk({ depot: q.depot, minDeferrals: q.min_deferrals, minDays: q.min_days }));
}

export async function statusBatch(req: Request, res: Response) {
  const body = req.body as z.infer<typeof StatusBatchSchema>;
  ok(res, await orders.applyStatusBatch(actorFrom(req), body.updates));
}

export async function changeStatus(req: Request, res: Response) {
  ok(res, await orders.changeOrderStatus(actorFrom(req), orderRefParam(req), req.body as StatusChangeInput));
}

export async function deferOrder(req: Request, res: Response) {
  const body = req.body as z.infer<typeof DeferOrderSchema>;
  ok(res, await orders.deferOrder(actorFrom(req), orderRefParam(req), body.reason_code, body.reason_note));
}

export async function recordReceipt(req: Request, res: Response) {
  ok(res, await orders.recordReceipt(actorFrom(req), orderRefParam(req), req.body as ReceiptInput));
}

export async function closeWindow(req: Request, res: Response) {
  const body = req.body as z.infer<typeof CloseWindowSchema>;
  // A closed day has no run to close; sweeping it would count the previous day's deliveries twice.
  if (body.date && !isOperatingDay(body.date)) {
    throw appError('NON_OPERATING_DATE', `${body.date} is not an operating day`, {
      date: body.date,
      next_operating_day: nextOperatingDay(body.date),
    });
  }
  ok(res, await runCutoffSweep(body.date ?? nextRunDate(), 'manual'));
}

export async function simulateDelivery(req: Request, res: Response) {
  ok(res, await simulateDeliveryForDay(req.body as SimulateDeliveryInput));
}
