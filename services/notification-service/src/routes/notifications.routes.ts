import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { authenticateJwt, requireRole } from '../middleware/auth';
import { alertsAfter, dispatcherView, getAlert, latestSeq, listAlerts, markRead, storeUpdateView } from '../services/alerts';
import { openStream } from '../services/hub';

const router = Router();

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.string().datetime({ offset: true }).optional(),
});
const ReadSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });
const UUID = z.string().uuid();

type Handler = (req: Request, res: Response) => Promise<unknown>;
const handle = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => {
  fn(req, res).catch((err) => {
    if (err?.name === 'ZodError') {
      return res.status(400).json({ success: false, error: 'Validation Error', details: err.errors });
    }
    next(err);
  });
};

router.use(authenticateJwt);

// Dispatcher dashboard: every alert (optionally limited to the dispatcher's depot).
router.get(
  '/alerts',
  requireRole('dispatcher'),
  handle(async (req, res) => {
    const query = ListQuerySchema.parse(req.query);
    const rows = await listAlerts(req.user!, query);
    res.json({ success: true, data: rows.map(dispatcherView) });
  }),
);

router.get(
  '/alerts/:id',
  requireRole('dispatcher'),
  handle(async (req, res) => {
    const row = UUID.safeParse(req.params.id).success ? await getAlert(req.user!, req.params.id) : null;
    if (!row) return res.status(404).json({ success: false, error: 'Alert not found' });
    res.json({ success: true, data: dispatcherView(row) });
  }),
);

// Store manager "Recent Updates": alerts about the outlet in the token, raised by someone else.
router.get(
  '/outlets/:outletId/updates',
  requireRole('store_manager'),
  handle(async (req, res) => {
    if (req.params.outletId !== req.user!.outlet_id) {
      return res.status(403).json({ success: false, error: 'Forbidden: You may only read updates for your own outlet' });
    }
    const query = ListQuerySchema.parse(req.query);
    const rows = await listAlerts(req.user!, { ...query, limit: req.query.limit ? query.limit : 100 });
    res.json({ success: true, data: rows.map(storeUpdateView) });
  }),
);

router.post(
  '/read',
  requireRole('dispatcher', 'store_manager'),
  handle(async (req, res) => {
    const { ids } = ReadSchema.parse(req.body);
    await markRead(req.user!, ids);
    res.status(204).end();
  }),
);

/**
 * Live alerts as Server-Sent Events. Send `Last-Event-ID` (the last frame's id) when reconnecting
 * to receive everything missed in between. Clients should load the REST list after the `ready`
 * frame, so nothing published between the two requests is lost.
 */
router.get(
  '/stream',
  requireRole('dispatcher', 'store_manager'),
  handle(async (req, res) => {
    const lastEventId = Number(req.header('Last-Event-ID') ?? req.query.lastEventId);
    const cursor = await latestSeq();
    const replay = Number.isInteger(lastEventId) && lastEventId > 0 ? await alertsAfter(req.user!, lastEventId) : [];
    openStream(req.user!, res, cursor, replay);
  }),
);

export default router;
