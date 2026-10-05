import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodTypeAny } from 'zod';
import { ORDER_STATUSES } from '../domain/statusMachine.js';
import { CALLER_REASON_CODES } from '../domain/reasonCodes.js';
import {
  CancelOrderSchema,
  CloseWindowSchema,
  ConfirmOrderSchema,
  CreateOrderSchema,
  DeferOrderSchema,
  ReceiptSchema,
  ReplaceItemsSchema,
  StatusBatchSchema,
  StatusChangeSchema,
} from '../schemas/orders.schema.js';

type Json = Record<string, unknown>;
type Examples = Record<string, { summary: string; value: unknown }>;

// ------------------------------------------------------------------ builders

const body = (schema: ZodTypeAny, examples: Examples, required = true): Json => ({
  required,
  content: {
    'application/json': {
      schema: zodToJsonSchema(schema, { target: 'openApi3', $refStrategy: 'none' }),
      examples,
    },
  },
});

/** outlet_id is injected from the token for store managers, so it is optional on the wire. */
const createBody = (examples: Examples): Json => {
  const media = body(CreateOrderSchema, examples) as { content: { 'application/json': { schema: { required?: string[] } } } };
  const schema = media.content['application/json'].schema;
  schema.required = (schema.required ?? []).filter((f) => f !== 'outlet_id');
  return media as unknown as Json;
};

const ref = (name: string): Json => ({ $ref: `#/components/schemas/${name}` });

const envelope = (data: Json): Json => ({
  type: 'object',
  required: ['success', 'data'],
  properties: { success: { type: 'boolean', example: true }, data },
});

const ok = (description: string, data: Json, example?: unknown): Json => ({
  description,
  content: {
    'application/json': {
      schema: envelope(data),
      ...(example !== undefined ? { example: { success: true, data: example } } : {}),
    },
  },
});

const errorBody = (code: string, message: string, details?: unknown) => ({
  success: false,
  error: { code, message, ...(details !== undefined ? { details } : {}) },
});

/** One response entry listing every error code that maps to this HTTP status, each with an example. */
const err = (...cases: [code: string, message: string, details?: unknown][]): Json => ({
  description: cases.map(([code]) => code).join(' · '),
  content: {
    'application/json': {
      schema: ref('ErrorResponse'),
      examples: Object.fromEntries(
        cases.map(([code, message, details]) => [code, { summary: code, value: errorBody(code, message, details) }]),
      ),
    },
  },
});

const q = (name: string, schema: Json, description?: string, example?: unknown): Json => ({
  name,
  in: 'query',
  required: false,
  schema,
  description,
  ...(example !== undefined ? { example } : {}),
});

const dateQ = (name: string, required = false, description?: string): Json => ({
  name,
  in: 'query',
  required,
  description,
  schema: { type: 'string', format: 'date' },
  example: '2026-09-29',
});

// ------------------------------------------------------------------ shared parameters

const orderRefParam: Json = {
  name: 'order_ref',
  in: 'path',
  required: true,
  description: 'Order reference returned by create.',
  schema: { type: 'string', pattern: '^ORD-\\d{8}-\\d{5,}$' },
  example: 'ORD-20260929-00042',
};

const depotQ = q('depot', { type: 'string', enum: ['Peliyagoda', 'Kandy'] }, 'Filter to one depot', 'Peliyagoda');

const idempotencyHeader: Json = {
  name: 'Idempotency-Key',
  in: 'header',
  required: false,
  description:
    'Optional. 1–100 printable characters. The same key with the same body returns the original order ' +
    '(200, `idempotent_replay: true`); the same key with a different body returns 409 IDEMPOTENCY_KEY_CONFLICT.',
  schema: { type: 'string', minLength: 1, maxLength: 100 },
  example: 'out001-2026-09-29-chilled-1',
};

const testNowHeader: Json = {
  name: 'X-Test-Now',
  in: 'header',
  required: false,
  description:
    'Non-production only. Evaluates this request as if it were the given instant (offset mandatory), ' +
    'so cutoff behaviour can be demonstrated at any time of day. Ignored when NODE_ENV=production.',
  schema: { type: 'string', format: 'date-time' },
  example: '2026-09-28T15:00:00+05:30',
};

const secured = [{ bearerAuth: [] }];

// ------------------------------------------------------------------ examples

const ITEM_MILK = {
  sku: 'MLK-1L',
  description: 'Fresh milk 1L',
  quantity: 120,
  unit_weight_kg: 1.03,
  unit_volume_m3: 0.0011,
  is_chilled: true,
};
const ITEM_RICE = {
  sku: 'RICE-5KG',
  description: 'Samba rice 5kg bag',
  quantity: 10,
  unit_weight_kg: 5.05,
  unit_volume_m3: 0.007,
  is_chilled: false,
};
const ITEM_TEA = {
  sku: 'TEA-400G',
  description: 'Ceylon tea 400g',
  quantity: 20,
  unit_weight_kg: 0.42,
  unit_volume_m3: 0.0009,
  is_chilled: false,
};

const ORDER_EXAMPLE = {
  order_ref: 'ORD-20260929-00042',
  outlet_id: 'OUT001',
  brand: 'Fresh',
  depot: 'Peliyagoda',
  order_date: '2026-09-29',
  original_order_date: '2026-09-29',
  requested_order_date: null,
  temp_requirement: 'chilled',
  status: 'confirmed',
  order_units: 120,
  order_weight_kg: 123.6,
  order_volume_m3: 0.132,
  window_open_time: '05:00',
  window_close_time: '07:30',
  placed_by: '9595b3cf-eec1-4559-9fcc-889ef5a9280c',
  placed_by_username: 'manager_out001',
  placed_at: '2026-09-28T04:30:00.000Z',
  confirmed_at: '2026-09-28T04:35:00.000Z',
  cutoff_applied_at: '2026-09-28T04:35:00.000Z',
  deferral_count: 0,
  vehicle_id: null,
  trip_id: null,
  idempotency_key: null,
  created_at: '2026-09-28T04:30:00.412Z',
  updated_at: '2026-09-28T04:35:00.108Z',
};

const ITEM_ROW_EXAMPLE = {
  id: '93774585-618a-433c-b13e-d1643eeec746',
  order_ref: 'ORD-20260929-00042',
  ...ITEM_MILK,
  created_at: '2026-09-28T04:30:00.412Z',
};

const event = (from: string | null, to: string, role: string, at: string, extra: Json = {}) => ({
  id: 'b3620ebe-62a7-4578-99d8-233e335c5781',
  order_ref: 'ORD-20260929-00042',
  from_status: from,
  to_status: to,
  reason_code: null,
  reason_note: null,
  actor_id: '9595b3cf-eec1-4559-9fcc-889ef5a9280c',
  actor_role: role,
  occurred_at: at,
  ...extra,
});

const detail = (overrides: Json = {}, events: unknown[] = []) => ({
  ...ORDER_EXAMPLE,
  ...overrides,
  items: [ITEM_ROW_EXAMPLE],
  events,
});

const DRAFT_DETAIL = detail(
  { status: 'draft', confirmed_at: null, cutoff_applied_at: null },
  [event(null, 'draft', 'store_manager', '2026-09-28T04:30:00.412Z')],
);

const CONFIRMED_DETAIL = detail({}, [
  event(null, 'draft', 'store_manager', '2026-09-28T04:30:00.412Z'),
  event('draft', 'confirmed', 'store_manager', '2026-09-28T04:35:00.108Z'),
]);

const VALIDATION_DETAILS = [{ field: 'items.0.quantity', message: 'quantity must be greater than 0' }];

// Errors every authenticated route can return.
const commonErrors: Json = {
  '401': err(
    ['UNAUTHORIZED', 'Bearer authorization token required'],
    ['INVALID_TOKEN', 'Invalid or expired access token'],
    ['INVALID_TOKEN_TYPE', 'Token must be an access token'],
  ),
  '503': err(['DB_UNAVAILABLE', 'Database is unavailable, please retry shortly']),
};

const forbidden = (withScope = true) =>
  err(
    ['FORBIDDEN', 'Access denied. Requires one of roles: [store_manager, dispatcher]'],
    ...(withScope
      ? ([
          [
            'OUTLET_SCOPE_VIOLATION',
            'Store manager for OUT001 may not access outlet OUT050',
            { token_outlet_id: 'OUT001', requested_outlet_id: 'OUT050' },
          ],
        ] as [string, string, unknown][])
      : []),
  );

const notFound = err(['ORDER_NOT_FOUND', 'Order ORD-20260929-99999 does not exist', { order_ref: 'ORD-20260929-99999' }]);
const validation = err(['VALIDATION_ERROR', 'Invalid request payload format', VALIDATION_DETAILS]);
const invalidTransition = (from: string, to: string, allowed: string[]): [string, string, unknown] => [
  'INVALID_STATE_TRANSITION',
  `Cannot move an order from '${from}' to '${to}'. Allowed: ${allowed.join(', ')}`,
  { from, to, allowed },
];

const orderResponse = (description: string, example: unknown): Json => ok(description, ref('OrderDetail'), example);

// ------------------------------------------------------------------ spec

export interface OpenApiOptions {
  servers?: { url: string; description: string; variables?: Record<string, { default: string; description?: string }> }[];
}

const OPERATION_IDS: Readonly<Record<string, string>> = {
  'get /health': 'getHealth',
  'get /': 'listOrders',
  'post /': 'createOrder',
  'get /confirmed': 'getConfirmedOrders',
  'get /at-risk': 'getAtRiskOutlets',
  'get /summary': 'getSummary',
  'get /products': 'listProducts',
  'patch /status-batch': 'applyStatusBatch',
  'post /close-window': 'closeWindow',
  'get /{order_ref}': 'getOrder',
  'delete /{order_ref}': 'cancelOrder',
  'put /{order_ref}/items': 'replaceOrderItems',
  'post /{order_ref}/confirm': 'confirmOrder',
  'get /{order_ref}/history': 'getOrderHistory',
  'patch /{order_ref}/status': 'changeOrderStatus',
  'post /{order_ref}/defer': 'deferOrder',
  'post /{order_ref}/receipt': 'recordReceipt',
};

export function buildOpenApiSpec(options: OpenApiOptions = {}): Json {
  const spec = buildSpec(options);
  for (const [path, operations] of Object.entries(spec.paths as Record<string, Record<string, Json>>)) {
    for (const [method, operation] of Object.entries(operations)) {
      const id = OPERATION_IDS[`${method} ${path}`];
      if (!id) throw new Error(`OpenAPI: no operationId registered for ${method.toUpperCase()} ${path}`);
      operations[method] = { operationId: id, ...operation };
    }
  }
  return spec;
}

function buildSpec(options: OpenApiOptions): Json {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Waypoint Order Management API',
      version: '1.0.0',
      description: [
        'Order lifecycle for the Waypoint delivery logistics platform: drafts, the 16:00 Asia/Colombo cutoff,',
        'deferrals, Planning write-back, store receipts and the dispatcher dashboard.',
        '',
        '### Authentication',
        'Every route except `/health` needs the header `Authorization: Bearer <access_token>`.',
        'Get a token from auth-rbac (through the gateway your environment uses), then press **Authorize** and paste it',
        '(without the `Bearer ` prefix):',
        '',
        '```bash',
        'curl -X POST "$GATEWAY_URL/api/auth/login" \\',
        "  -H 'Content-Type: application/json' \\",
        '  -d \'{"username":"manager_out001","password":"Password123!"}\'',
        '```',
        '',
        'Seeded accounts (password `Password123!`): `dispatcher_admin`, `manager_out001` (outlet OUT001),',
        '`loader_peliyagoda`, `driver_colombo`.',
        '',
        '### Headers',
        '| Header | Where | Purpose |',
        '|---|---|---|',
        '| `Authorization: Bearer <token>` | all but `/health` | access token from auth-rbac |',
        '| `Content-Type: application/json` | requests with a body | |',
        '| `Idempotency-Key` | `POST /` | safe retries of create |',
        '| `X-Test-Now` | any (non-production) | freeze the business clock for one request |',
        '',
        '### Responses',
        'Success: `{ "success": true, "data": … }`. Failure: `{ "success": false, "error": { code, message, details? } }`.',
        'Dates are `YYYY-MM-DD`, delivery windows `HH:mm` (Asia/Colombo), instants ISO 8601 UTC.',
        '',
        '### Example flow',
        '1. `POST /` create a draft → 2. `POST /{order_ref}/confirm` → 3. `GET /confirmed?date=` (Planning reads)',
        '→ 4. `PATCH /status-batch` (allocate or defer) → 5. `PATCH /{order_ref}/status` (loaded → out_for_delivery → delivered)',
        '→ 6. `POST /{order_ref}/receipt`.',
        '',
        'Full reference with the reasoning behind each rule: `services/order-management/docs/API.md`.',
      ].join('\n'),
    },
    servers: options.servers ?? [{ url: '/api/orders', description: 'This service (direct or via the gateway)' }],
    tags: [
      { name: 'Health', description: 'Liveness and readiness' },
      { name: 'Orders', description: 'Create, edit, confirm, cancel, read' },
      { name: 'Planning', description: 'Contract with Planning & Allocation' },
      { name: 'Execution', description: 'Status updates from the dock and the road' },
      { name: 'Dispatch', description: 'Deferral, risk and dashboard views' },
      { name: 'Store', description: 'Receipt at the outlet' },
      { name: 'Catalogue', description: 'Products a store can order' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Access token from `POST /api/auth/login`. Sent as `Authorization: Bearer <token>`.',
        },
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          required: ['success', 'error'],
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: { type: 'string', example: 'CUTOFF_PASSED' },
                message: { type: 'string' },
                details: { description: 'Field list, next_available_date, failures[] etc.' },
              },
            },
          },
        },
        OrderStatus: { type: 'string', enum: [...ORDER_STATUSES] },
        OrderItem: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            order_ref: { type: 'string' },
            sku: { type: 'string', example: 'MLK-1L' },
            description: { type: 'string' },
            quantity: { type: 'integer' },
            unit_weight_kg: { type: 'number' },
            unit_volume_m3: { type: 'number' },
            is_chilled: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        OrderEvent: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            order_ref: { type: 'string' },
            from_status: { type: 'string', nullable: true },
            to_status: ref('OrderStatus'),
            reason_code: { type: 'string', nullable: true },
            reason_note: { type: 'string', nullable: true },
            actor_id: { type: 'string', nullable: true },
            actor_role: { type: 'string' },
            occurred_at: { type: 'string', format: 'date-time' },
          },
        },
        Order: {
          type: 'object',
          properties: {
            order_ref: { type: 'string', example: 'ORD-20260929-00042' },
            outlet_id: { type: 'string', example: 'OUT001' },
            brand: { type: 'string', enum: ['Fresh', 'Style', 'Tech'] },
            depot: { type: 'string', enum: ['Peliyagoda', 'Kandy'] },
            order_date: { type: 'string', format: 'date' },
            original_order_date: { type: 'string', format: 'date' },
            requested_order_date: { type: 'string', format: 'date', nullable: true },
            temp_requirement: { type: 'string', enum: ['ambient', 'chilled'] },
            status: ref('OrderStatus'),
            order_units: { type: 'integer' },
            order_weight_kg: { type: 'number' },
            order_volume_m3: { type: 'number' },
            window_open_time: { type: 'string', example: '05:00' },
            window_close_time: { type: 'string', example: '07:30' },
            placed_by: { type: 'string', nullable: true },
            placed_by_username: { type: 'string' },
            placed_at: { type: 'string', format: 'date-time' },
            confirmed_at: { type: 'string', format: 'date-time', nullable: true },
            cutoff_applied_at: { type: 'string', format: 'date-time', nullable: true },
            deferral_count: { type: 'integer' },
            vehicle_id: { type: 'string', nullable: true },
            trip_id: { type: 'integer', nullable: true },
            idempotency_key: { type: 'string', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        OrderDetail: {
          allOf: [
            ref('Order'),
            {
              type: 'object',
              properties: {
                items: { type: 'array', items: ref('OrderItem') },
                events: { type: 'array', description: 'Latest 20, oldest first', items: ref('OrderEvent') },
              },
            },
          ],
        },
      },
    },
    paths: {
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Liveness and DB readiness',
          description:
            'Public. Pings the database; returns 503 when it is unreachable. `reference_data.outlets` reports when outlets ' +
            'were last copied from Fleet & Directory\'s `outlets` table.',
          security: [],
          responses: {
            '200': {
              description: 'Healthy',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      service: { type: 'string' },
                      status: { type: 'string' },
                      db: { type: 'string', enum: ['up', 'down'] },
                      reference_data: {
                        type: 'object',
                        properties: {
                          outlets: {
                            type: 'object',
                            properties: {
                              source: { type: 'string' },
                              last_synced_at: { type: 'string', format: 'date-time', nullable: true },
                              outlets: { type: 'integer', nullable: true },
                              skipped_invalid: { type: 'integer', nullable: true },
                              last_error: { type: 'string', nullable: true },
                            },
                          },
                        },
                      },
                      timestamp: { type: 'string', format: 'date-time' },
                    },
                  },
                  example: {
                    service: 'order-management',
                    status: 'healthy',
                    db: 'up',
                    reference_data: {
                      outlets: {
                        source: 'database: outlets (Fleet & Directory)',
                        last_synced_at: '2026-09-27T18:05:02.118Z',
                        outlets: 120,
                        skipped_invalid: 0,
                        last_error: null,
                      },
                    },
                    timestamp: '2026-09-27T18:07:31.046Z',
                  },
                },
              },
            },
            '503': {
              description: 'Database unreachable',
              content: {
                'application/json': {
                  example: { service: 'order-management', status: 'degraded', db: 'down', timestamp: '2026-09-27T18:07:31.046Z' },
                },
              },
            },
          },
        },
      },
      '/': {
        get: {
          tags: ['Orders'],
          summary: 'List orders',
          description:
            'Roles: store_manager (forced to own outlet), dispatcher, loader. Items are not included. ' +
            'Sorted by order_date DESC, order_ref ASC.',
          security: secured,
          parameters: [
            q('outlet_id', { type: 'string' }, 'Exact outlet', 'OUT001'),
            depotQ,
            q('brand', { type: 'string', enum: ['Fresh', 'Style', 'Tech'] }),
            q('temp_requirement', { type: 'string', enum: ['ambient', 'chilled'] }),
            {
              ...q('status', { type: 'array', items: ref('OrderStatus') }, 'Repeatable (`?status=a&status=b`) or comma-separated'),
              style: 'form',
              explode: true,
              example: ['confirmed', 'allocated'],
            },
            dateQ('from', false, 'Inclusive, on order_date'),
            dateQ('to', false, 'Inclusive, on order_date; from must be <= to'),
            q('page', { type: 'integer', minimum: 1, default: 1 }),
            q('page_size', { type: 'integer', minimum: 1, maximum: 200, default: 50 }),
          ],
          responses: {
            '200': ok(
              'Page of orders',
              {
                type: 'object',
                properties: {
                  orders: { type: 'array', items: ref('Order') },
                  page: { type: 'integer' },
                  page_size: { type: 'integer' },
                  total: { type: 'integer' },
                },
              },
              { orders: [ORDER_EXAMPLE], page: 1, page_size: 50, total: 1 },
            ),
            '400': err(['VALIDATION_ERROR', 'Invalid request query parameters', [{ field: 'from', message: "'from' must be on or before 'to'" }]]),
            '403': forbidden(),
            ...commonErrors,
          },
        },
        post: {
          tags: ['Orders'],
          summary: 'Create a draft order',
          description:
            'Roles: store_manager (own outlet; `outlet_id` is taken from the token), dispatcher (`outlet_id` required).\n\n' +
            'Chilled orders are Fresh-only and every item `is_chilled` must match `temp_requirement`. ' +
            'Omit `order_date` for "next available run" — the date is then fixed at confirm time.',
          security: secured,
          parameters: [idempotencyHeader, testNowHeader],
          requestBody: createBody({
            storeManagerChilled: {
              summary: 'Store manager — chilled order for the next run (outlet from token)',
              value: { temp_requirement: 'chilled', items: [ITEM_MILK] },
            },
            dispatcherAmbientDated: {
              summary: 'Dispatcher — ambient order for a specific date',
              value: { outlet_id: 'OUT050', temp_requirement: 'ambient', order_date: '2026-10-01', items: [ITEM_RICE, ITEM_TEA] },
            },
            emptyDraft: {
              summary: 'Empty draft (add items later with PUT /{order_ref}/items)',
              value: { outlet_id: 'OUT050', temp_requirement: 'ambient' },
            },
          }),
          responses: {
            '201': orderResponse('Draft created', DRAFT_DETAIL),
            '200': orderResponse('Idempotent replay of an earlier create', { ...DRAFT_DETAIL, idempotent_replay: true }),
            '400': validation,
            '403': forbidden(),
            '404': err(['OUTLET_NOT_FOUND', 'Outlet OUT999 does not exist', { outlet_id: 'OUT999' }]),
            '409': err(
              [
                'DUPLICATE_ORDER',
                'Outlet OUT001 already has an active chilled order for 2026-09-29',
                { existing_order_ref: 'ORD-20260929-00042', outlet_id: 'OUT001', order_date: '2026-09-29', temp_requirement: 'chilled' },
              ],
              ['CUTOFF_PASSED', 'Ordering for 2026-09-29 has closed', { requested_date: '2026-09-29', next_available_date: '2026-09-30' }],
              [
                'IDEMPOTENCY_KEY_CONFLICT',
                'This Idempotency-Key was already used with a different request body',
                { idempotency_key: 'out001-2026-09-29-chilled-1', order_ref: 'ORD-20260929-00042' },
              ],
            ),
            '422': err(
              [
                'CHILLED_MISMATCH',
                'Every item on an ambient order must have is_chilled=false. Place chilled and ambient goods on separate orders.',
                { temp_requirement: 'ambient', mismatched_items: [{ index: 0, sku: 'MLK-1L', is_chilled: true }] },
              ],
              ['NON_OPERATING_DATE', '2026-10-04 is not an operating day', { order_date: '2026-10-04', next_operating_day: '2026-10-05' }],
            ),
            ...commonErrors,
          },
        },
      },
      '/confirmed': {
        get: {
          tags: ['Planning'],
          summary: 'Confirmed pool for one delivery date (the Planning contract)',
          description:
            'Roles: dispatcher, loader. Most-deferred and longest-unserved first. Outlet access fields are joined onto ' +
            'each row so Planning can check feasibility without a second call. `totals` equal the sum of the rows.',
          security: secured,
          parameters: [dateQ('date', true, 'Delivery date'), depotQ],
          responses: {
            '200': ok(
              'Confirmed orders with totals',
              {
                type: 'object',
                properties: {
                  date: { type: 'string', format: 'date' },
                  depot: { type: 'string', nullable: true },
                  totals: {
                    type: 'object',
                    properties: {
                      orders: { type: 'integer' },
                      units: { type: 'integer' },
                      weight_kg: { type: 'number' },
                      volume_m3: { type: 'number' },
                      chilled_orders: { type: 'integer' },
                      chilled_volume_m3: { type: 'number' },
                    },
                  },
                  orders: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        order_ref: { type: 'string' },
                        outlet_id: { type: 'string' },
                        brand: { type: 'string' },
                        depot: { type: 'string' },
                        district: { type: 'string' },
                        temp_requirement: { type: 'string' },
                        order_units: { type: 'integer' },
                        order_weight_kg: { type: 'number' },
                        order_volume_m3: { type: 'number' },
                        window_open_time: { type: 'string' },
                        window_close_time: { type: 'string' },
                        dock_type: { type: 'string', enum: ['rear_dock', 'street', 'mall_bay'] },
                        parking_constraint: { type: 'string', enum: ['normal', 'van_only', 'mall_dock'] },
                        mall_window: { type: 'boolean' },
                        deferral_count: { type: 'integer' },
                        deferred_yesterday: { type: 'boolean' },
                        days_since_last_served: { type: 'integer' },
                        original_order_date: { type: 'string', format: 'date' },
                      },
                    },
                  },
                },
              },
              {
                date: '2026-09-29',
                depot: 'Peliyagoda',
                totals: { orders: 2, units: 162, weight_kg: 406.1, volume_m3: 1.223, chilled_orders: 1, chilled_volume_m3: 0.132 },
                orders: [
                  {
                    order_ref: 'ORD-20260925-01374',
                    outlet_id: 'OUT045',
                    brand: 'Fresh',
                    depot: 'Peliyagoda',
                    district: 'Kalutara',
                    temp_requirement: 'ambient',
                    order_units: 42,
                    order_weight_kg: 282.5,
                    order_volume_m3: 1.091,
                    window_open_time: '03:00',
                    window_close_time: '08:00',
                    dock_type: 'rear_dock',
                    parking_constraint: 'normal',
                    mall_window: false,
                    deferral_count: 2,
                    deferred_yesterday: true,
                    days_since_last_served: 9,
                    original_order_date: '2026-09-25',
                  },
                  {
                    order_ref: 'ORD-20260929-00042',
                    outlet_id: 'OUT001',
                    brand: 'Fresh',
                    depot: 'Peliyagoda',
                    district: 'Colombo',
                    temp_requirement: 'chilled',
                    order_units: 120,
                    order_weight_kg: 123.6,
                    order_volume_m3: 0.132,
                    window_open_time: '05:00',
                    window_close_time: '07:30',
                    dock_type: 'street',
                    parking_constraint: 'van_only',
                    mall_window: false,
                    deferral_count: 0,
                    deferred_yesterday: false,
                    days_since_last_served: 1,
                    original_order_date: '2026-09-29',
                  },
                ],
              },
            ),
            '400': err(['VALIDATION_ERROR', 'Invalid request query parameters', [{ field: 'date', message: 'Required' }]]),
            '403': forbidden(false),
            ...commonErrors,
          },
        },
      },
      '/at-risk': {
        get: {
          tags: ['Dispatch'],
          summary: 'Outlets at risk of being skipped again',
          description: 'Role: dispatcher. Flags: CONSECUTIVE_DEFERRAL_RISK, STALE_SERVICE, AGED_OUT_RECENTLY. Worst first.',
          security: secured,
          parameters: [
            depotQ,
            q('min_deferrals', { type: 'integer', minimum: 1, maximum: 50, default: 2 }),
            q('min_days', { type: 'integer', minimum: 1, maximum: 365, default: 3 }),
          ],
          responses: {
            '200': ok(
              'At-risk outlets',
              {
                type: 'object',
                properties: {
                  criteria: { type: 'object' },
                  outlets: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        outlet_id: { type: 'string' },
                        brand: { type: 'string' },
                        district: { type: 'string' },
                        depot: { type: 'string' },
                        deferred_yesterday: { type: 'boolean' },
                        days_since_last_served: { type: 'integer' },
                        last_served_date: { type: 'string', format: 'date', nullable: true },
                        max_deferral_count: { type: 'integer' },
                        open_orders: { type: 'integer' },
                        overdue_open_orders: { type: 'integer' },
                        aged_out_orders: { type: 'integer' },
                        flags: {
                          type: 'array',
                          items: { type: 'string', enum: ['CONSECUTIVE_DEFERRAL_RISK', 'STALE_SERVICE', 'AGED_OUT_RECENTLY'] },
                        },
                      },
                    },
                  },
                },
              },
              {
                criteria: { min_deferrals: 2, min_days: 3, depot: 'Peliyagoda' },
                outlets: [
                  {
                    outlet_id: 'OUT045',
                    brand: 'Fresh',
                    district: 'Kalutara',
                    depot: 'Peliyagoda',
                    deferred_yesterday: true,
                    days_since_last_served: 9,
                    last_served_date: '2026-09-18',
                    max_deferral_count: 3,
                    open_orders: 3,
                    overdue_open_orders: 1,
                    aged_out_orders: 1,
                    flags: ['CONSECUTIVE_DEFERRAL_RISK', 'STALE_SERVICE', 'AGED_OUT_RECENTLY'],
                  },
                ],
              },
            ),
            '400': err(['VALIDATION_ERROR', 'Invalid request query parameters', [{ field: 'min_days', message: 'Number must be greater than or equal to 1' }]]),
            '403': forbidden(false),
            ...commonErrors,
          },
        },
      },
      '/products': {
        get: {
          tags: ['Catalogue'],
          summary: 'Products a store can order',
          description:
            'Roles: store_manager, dispatcher. A store manager only sees the brand of their own outlet. ' +
            '`categories` is a comma-separated list of `chilled`, `dry`, `tech`, `style` (Fresh splits into chilled and dry). ' +
            '`search` matches the description or the SKU, case-insensitively. Each product carries the per-unit weight and ' +
            'volume and the `is_chilled` flag an order line needs.',
          security: secured,
          parameters: [
            q('categories', { type: 'string' }, 'Comma-separated: chilled, dry, tech, style. Default: all the caller may see', 'chilled,dry'),
            q('search', { type: 'string', maxLength: 80 }, 'Matches description or SKU', 'milk'),
          ],
          responses: {
            '200': ok(
              'Products, grouped by brand then temperature',
              {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    sku: { type: 'string' },
                    description: { type: 'string' },
                    brand: { type: 'string', enum: ['Fresh', 'Style', 'Tech'] },
                    temp_requirement: { type: 'string', enum: ['ambient', 'chilled'] },
                    category: { type: 'string', enum: ['chilled', 'dry', 'tech', 'style'] },
                    unit_weight_kg: { type: 'number' },
                    unit_volume_m3: { type: 'number' },
                    is_chilled: { type: 'boolean' },
                  },
                },
              },
              [
                {
                  sku: 'MLK-1L',
                  description: 'Fresh milk 1L',
                  brand: 'Fresh',
                  temp_requirement: 'chilled',
                  category: 'chilled',
                  unit_weight_kg: 1.03,
                  unit_volume_m3: 0.0011,
                  is_chilled: true,
                },
              ],
            ),
            '400': validation,
            '403': forbidden(),
            ...commonErrors,
          },
        },
      },
      '/summary': {
        get: {
          tags: ['Dispatch'],
          summary: 'Dispatcher dashboard for one date',
          description:
            'Role: dispatcher. Counts by status, totals by brand and temperature, and chilled demand against ' +
            'refrigerated fleet capacity. Capacity is the available reefers reported by Fleet & Directory\'s API. ' +
            'If Fleet cannot be reached, `available` is false and the capacity figures are null; nothing is estimated.',
          security: secured,
          parameters: [dateQ('date', false, 'Default: next operating day'), depotQ],
          responses: {
            '200': ok(
              'Summary',
              {
                type: 'object',
                properties: {
                  date: { type: 'string', format: 'date' },
                  depot: { type: 'string', nullable: true },
                  by_status: { type: 'object', additionalProperties: { type: 'integer' } },
                  by_brand: { type: 'object', additionalProperties: { type: 'object' } },
                  by_temperature: { type: 'object', additionalProperties: { type: 'object' } },
                  chilled_capacity_reference: {
                    type: 'object',
                    properties: {
                      available: { type: 'boolean', description: 'false when Fleet & Directory could not be reached' },
                      note: { type: 'string' },
                      reefer_vehicles: { type: 'integer', nullable: true },
                      reefer_volume_m3: { type: 'number', nullable: true },
                      chilled_trips_per_day: { type: 'integer' },
                      capacity_m3: { type: 'number', nullable: true },
                      demand_m3: { type: 'number' },
                      utilisation_pct: { type: 'number', nullable: true },
                      exceeds_capacity: { type: 'boolean', nullable: true },
                    },
                  },
                },
              },
              {
                date: '2026-09-29',
                depot: 'Peliyagoda',
                by_status: { confirmed: 131, cancelled: 2 },
                by_brand: {
                  Fresh: { orders: 105, units: 61240, weight_kg: 148210.4, volume_m3: 412.87 },
                  Style: { orders: 16, units: 512, weight_kg: 4012.5, volume_m3: 48.9 },
                  Tech: { orders: 10, units: 22, weight_kg: 911, volume_m3: 6.27 },
                },
                by_temperature: {
                  ambient: { orders: 75, units: 9480, weight_kg: 35210.6, volume_m3: 177.54 },
                  chilled: { orders: 56, units: 52294, weight_kg: 117923.3, volume_m3: 290.5 },
                },
                chilled_capacity_reference: {
                  available: true,
                  note: 'Volume of the available refrigerated vehicles, from Fleet & Directory',
                  reefer_vehicles: 9,
                  reefer_volume_m3: 207.5,
                  chilled_trips_per_day: 1,
                  capacity_m3: 207.5,
                  demand_m3: 290.5,
                  utilisation_pct: 140,
                  exceeds_capacity: true,
                },
              },
            ),
            '400': err(['VALIDATION_ERROR', 'Invalid request query parameters', [{ field: 'date', message: 'Must be a valid date in YYYY-MM-DD format' }]]),
            '403': forbidden(false),
            ...commonErrors,
          },
        },
      },
      '/status-batch': {
        patch: {
          tags: ['Planning'],
          summary: 'Planning write-back (all-or-nothing, up to 500 updates)',
          description:
            'Role: dispatcher. `allocated` needs `vehicle_id` and `trip_id` (1 or 2). `deferred` needs a `reason_code` and runs the ' +
            'full deferral sequence. Entries are applied in order. If any entry fails **nothing** is applied and every failure ' +
            'is listed in `error.details.failures[]` (HTTP 422).',
          security: secured,
          requestBody: body(StatusBatchSchema, {
            allocateAndDefer: {
              summary: 'Allocate one order, defer another',
              value: {
                updates: [
                  { order_ref: 'ORD-20260929-00042', status: 'allocated', vehicle_id: 'VEH001', trip_id: 1 },
                  {
                    order_ref: 'ORD-20260929-00043',
                    status: 'deferred',
                    reason_code: 'NO_REEFER_AVAILABLE',
                    reason_note: 'all 9 Peliyagoda reefers committed to trip 1',
                  },
                ],
              },
            },
            progressOneOrder: {
              summary: 'Move one order through several steps in order',
              value: {
                updates: [
                  { order_ref: 'ORD-20260929-00042', status: 'loaded' },
                  { order_ref: 'ORD-20260929-00042', status: 'out_for_delivery' },
                  { order_ref: 'ORD-20260929-00042', status: 'delivered' },
                ],
              },
            },
          }),
          responses: {
            '200': ok(
              'Batch applied',
              { type: 'object', properties: { updated: { type: 'integer' }, orders: { type: 'array', items: ref('Order') } } },
              { updated: 1, orders: [{ ...ORDER_EXAMPLE, status: 'allocated', vehicle_id: 'VEH001', trip_id: 1 }] },
            ),
            '400': err(['VALIDATION_ERROR', 'Invalid request payload format', [{ field: 'updates', message: 'At most 500 updates per call' }]]),
            '403': forbidden(false),
            '422': err(
              [
                'ORDER_NOT_FOUND',
                '1 of 2 update(s) rejected; no changes were applied',
                {
                  failures: [
                    {
                      index: 1,
                      order_ref: 'ORD-00000000-99999',
                      code: 'ORDER_NOT_FOUND',
                      message: 'Order ORD-00000000-99999 does not exist',
                      details: { order_ref: 'ORD-00000000-99999' },
                    },
                  ],
                },
              ],
              [
                'INVALID_STATE_TRANSITION',
                '1 of 1 update(s) rejected; no changes were applied',
                {
                  failures: [
                    {
                      index: 0,
                      order_ref: 'ORD-20260929-00042',
                      code: 'INVALID_STATE_TRANSITION',
                      message: "Cannot move an order from 'delivered' to 'confirmed'. Allowed: received, disputed",
                      details: { from: 'delivered', to: 'confirmed', allowed: ['received', 'disputed'] },
                    },
                  ],
                },
              ],
            ),
            ...commonErrors,
          },
        },
      },
      '/close-window': {
        post: {
          tags: ['Dispatch'],
          summary: 'Run the cutoff sweep for a date (idempotent)',
          description:
            'Role: dispatcher. The routine the timer runs after 16:00 Colombo: re-pools deferred orders, updates outlet ' +
            'fairness counters. A repeat call for the same date changes nothing and returns the stored result.',
          security: secured,
          requestBody: body(
            CloseWindowSchema,
            {
              nextRun: { summary: 'Default — next operating day', value: {} },
              specificDate: { summary: 'A specific delivery date', value: { date: '2026-09-29' } },
            },
            false,
          ),
          responses: {
            '200': ok(
              'Sweep result',
              {
                type: 'object',
                properties: {
                  job_name: { type: 'string' },
                  job_key: { type: 'string', format: 'date' },
                  already_ran: { type: 'boolean' },
                  ran_at: { type: 'string', format: 'date-time' },
                  result: { type: 'object' },
                },
              },
              {
                job_name: 'cutoff_sweep',
                job_key: '2026-09-29',
                already_ran: false,
                ran_at: '2026-09-28T10:30:04.512Z',
                result: {
                  trigger: 'manual',
                  service_day: '2026-09-28',
                  closing_date: '2026-09-29',
                  swept_order_refs: [],
                  deferred_swept_to_confirmed: 0,
                  outlets_deferred_flag_cleared: 2,
                  outlets_days_since_served_incremented: 41,
                },
              },
            ),
            '400': err(['VALIDATION_ERROR', 'Invalid request payload format', [{ field: 'date', message: 'Must be a valid date in YYYY-MM-DD format' }]]),
            '403': forbidden(false),
            ...commonErrors,
          },
        },
      },
      '/{order_ref}': {
        get: {
          tags: ['Orders'],
          summary: 'Get an order with items and its latest 20 events',
          description: 'Roles: store_manager (own outlet), dispatcher, loader.',
          security: secured,
          parameters: [orderRefParam],
          responses: { '200': orderResponse('Order', CONFIRMED_DETAIL), '403': forbidden(), '404': notFound, ...commonErrors },
        },
        delete: {
          tags: ['Orders'],
          summary: 'Cancel (soft delete) a draft or confirmed order',
          description: 'Roles: store_manager (own outlet), dispatcher. The row is kept with status `cancelled`; the slot can be re-ordered.',
          security: secured,
          parameters: [orderRefParam],
          requestBody: body(
            CancelOrderSchema,
            {
              withReason: { summary: 'With a reason', value: { reason_note: 'Duplicate entry by store' } },
              noBody: { summary: 'No reason', value: {} },
            },
            false,
          ),
          responses: {
            '200': orderResponse(
              'Order with status cancelled',
              detail({ status: 'cancelled' }, [
                event('confirmed', 'cancelled', 'store_manager', '2026-09-28T05:01:11.020Z', { reason_note: 'Duplicate entry by store' }),
              ]),
            ),
            '403': forbidden(),
            '404': notFound,
            '409': err([
              'ORDER_NOT_CANCELLABLE',
              "Order ORD-20260929-00042 is 'allocated' and can no longer be cancelled here; after allocation cancellation is a Planning decision",
              { order_ref: 'ORD-20260929-00042', status: 'allocated', cancellable_from: ['draft', 'confirmed'] },
            ]),
            ...commonErrors,
          },
        },
      },
      '/{order_ref}/items': {
        put: {
          tags: ['Orders'],
          summary: 'Replace the whole basket',
          description:
            'Roles: store_manager (own outlet), dispatcher. Full replacement, not a patch. Editable while `draft`, ' +
            'or while `confirmed` and before that delivery date\'s cutoff. Totals are recomputed from the items.',
          security: secured,
          parameters: [orderRefParam, testNowHeader],
          requestBody: body(ReplaceItemsSchema, {
            ambientBasket: { summary: 'Two ambient lines', value: { items: [ITEM_RICE, ITEM_TEA] } },
            chilledBasket: { summary: 'One chilled line', value: { items: [ITEM_MILK] } },
          }),
          responses: {
            '200': orderResponse('Updated order', DRAFT_DETAIL),
            '400': validation,
            '403': forbidden(),
            '404': notFound,
            '409': err([
              'ORDER_NOT_EDITABLE',
              "Items cannot be changed once an order is 'allocated'",
              { order_ref: 'ORD-20260929-00042', status: 'allocated', order_date: '2026-09-29' },
            ]),
            '422': err(
              ['EMPTY_ORDER', 'A confirmed order must keep at least one item; cancel it instead', { order_ref: 'ORD-20260929-00042' }],
              [
                'CHILLED_MISMATCH',
                'Every item on an ambient order must have is_chilled=false. Place chilled and ambient goods on separate orders.',
                { temp_requirement: 'ambient', mismatched_items: [{ index: 0, sku: 'MLK-1L', is_chilled: true }] },
              ],
            ),
            ...commonErrors,
          },
        },
      },
      '/{order_ref}/confirm': {
        post: {
          tags: ['Orders'],
          summary: 'Confirm a draft under the 16:00 cutoff',
          description:
            'Roles: store_manager (own outlet), dispatcher. Before 16:00 Asia/Colombo the order is confirmed for the next ' +
            'operating day. At or after 16:00 it returns 409 CUTOFF_PASSED unless `accept_next_run` is true, in which case ' +
            'it rolls to the following run. Use `X-Test-Now` to try both sides of the cutoff.',
          security: secured,
          parameters: [orderRefParam, testNowHeader],
          requestBody: body(
            ConfirmOrderSchema,
            {
              beforeCutoff: { summary: 'Normal confirm (no body needed)', value: {} },
              acceptNextRun: { summary: 'After cutoff — accept the following run', value: { accept_next_run: true } },
            },
            false,
          ),
          responses: {
            '200': ok(
              'Confirmed',
              { allOf: [ref('OrderDetail'), { type: 'object', properties: { rolled_to_next_run: { type: 'boolean' } } }] },
              { ...CONFIRMED_DETAIL, rolled_to_next_run: false },
            ),
            '403': forbidden(),
            '404': notFound,
            '409': err(
              [
                'CUTOFF_PASSED',
                'The 16:00 Asia/Colombo cutoff for 2026-09-29 has passed. Resend with {"accept_next_run": true} to confirm for the next available run.',
                { requested_date: '2026-09-29', next_available_date: '2026-09-30' },
              ],
              [
                'INVALID_STATE_TRANSITION',
                "Only draft orders can be confirmed; ORD-20260929-00042 is 'confirmed'",
                { from: 'confirmed', to: 'confirmed', allowed: ['allocated', 'deferred', 'cancelled'] },
              ],
              [
                'DUPLICATE_ORDER',
                'Outlet OUT001 already has an active chilled order for 2026-09-29',
                { existing_order_ref: 'ORD-20260929-00040', outlet_id: 'OUT001', order_date: '2026-09-29', temp_requirement: 'chilled' },
              ],
            ),
            '422': err(
              ['EMPTY_ORDER', 'Add at least one item before confirming', { order_ref: 'ORD-20260929-00042' }],
              ['NON_OPERATING_DATE', '2026-05-01 is no longer an operating day', { order_date: '2026-05-01', next_operating_day: '2026-05-02' }],
            ),
            ...commonErrors,
          },
        },
      },
      '/{order_ref}/history': {
        get: {
          tags: ['Orders'],
          summary: 'Complete audit trail, oldest first',
          description: 'Roles: store_manager (own outlet), dispatcher. Each coded reason carries a readable `reason_label`.',
          security: secured,
          parameters: [orderRefParam],
          responses: {
            '200': ok(
              'History',
              {
                type: 'object',
                properties: {
                  order_ref: { type: 'string' },
                  outlet_id: { type: 'string' },
                  status: ref('OrderStatus'),
                  order_date: { type: 'string', format: 'date' },
                  original_order_date: { type: 'string', format: 'date' },
                  deferral_count: { type: 'integer' },
                  events: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        from_status: { type: 'string', nullable: true },
                        to_status: ref('OrderStatus'),
                        reason_code: { type: 'string', nullable: true },
                        reason_label: { type: 'string', nullable: true },
                        reason_note: { type: 'string', nullable: true },
                        actor_id: { type: 'string', nullable: true },
                        actor_role: { type: 'string' },
                        occurred_at: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                },
              },
              {
                order_ref: 'ORD-20260921-01373',
                outlet_id: 'OUT045',
                status: 'confirmed',
                order_date: '2026-09-22',
                original_order_date: '2026-09-21',
                deferral_count: 1,
                events: [
                  { from_status: null, to_status: 'draft', reason_code: null, reason_label: null, reason_note: null, actor_id: null, actor_role: 'store_manager', occurred_at: '2026-09-19T05:10:00.000Z' },
                  { from_status: 'draft', to_status: 'confirmed', reason_code: null, reason_label: null, reason_note: null, actor_id: null, actor_role: 'store_manager', occurred_at: '2026-09-19T05:21:00.000Z' },
                  { from_status: 'confirmed', to_status: 'deferred', reason_code: 'CAPACITY_WEIGHT', reason_label: 'Vehicle weight limits exhausted', reason_note: null, actor_id: null, actor_role: 'dispatcher', occurred_at: '2026-09-19T12:50:00.000Z' },
                  { from_status: 'deferred', to_status: 'confirmed', reason_code: null, reason_label: null, reason_note: 'Returned to the confirmed pool for 2026-09-22 (deferral 1 of 3)', actor_id: null, actor_role: 'system', occurred_at: '2026-09-19T12:50:01.200Z' },
                ],
              },
            ),
            '403': forbidden(),
            '404': notFound,
            ...commonErrors,
          },
        },
      },
      '/{order_ref}/status': {
        patch: {
          tags: ['Execution'],
          summary: 'Change one order\'s status (dock and road updates)',
          description:
            'Roles: **loader** may set `loaded`; **driver** may set `out_for_delivery` and `delivered`; **dispatcher** may set ' +
            'anything the batch endpoint allows. Same rules as one `status-batch` entry. `received` / `disputed` are set only ' +
            'by `POST /{order_ref}/receipt`.',
          security: secured,
          parameters: [orderRefParam],
          requestBody: body(StatusChangeSchema, {
            loaded: { summary: 'Loader — goods loaded', value: { status: 'loaded' } },
            outForDelivery: { summary: 'Driver — left the depot', value: { status: 'out_for_delivery' } },
            delivered: { summary: 'Driver — delivered at the outlet', value: { status: 'delivered', reason_note: 'POD signed 06:42' } },
            allocated: { summary: 'Dispatcher — allocate', value: { status: 'allocated', vehicle_id: 'VEH001', trip_id: 1 } },
          }),
          responses: {
            '200': orderResponse(
              'Updated order',
              detail({ status: 'delivered', vehicle_id: 'VEH001', trip_id: 1 }, [
                event('out_for_delivery', 'delivered', 'driver', '2026-09-29T01:12:40.300Z', { reason_note: 'POD signed 06:42' }),
              ]),
            ),
            '400': err(
              ['VALIDATION_ERROR', 'Invalid request payload format', [{ field: 'status', message: 'Invalid enum value' }]],
            ),
            '403': err(['FORBIDDEN', "Role 'driver' may not set status 'allocated'", { role: 'driver', status: 'allocated', permitted: ['out_for_delivery', 'delivered'] }]),
            '404': notFound,
            '409': err(invalidTransition('confirmed', 'delivered', ['allocated', 'deferred', 'cancelled'])),
            '422': err(['DEFERRAL_REASON_REQUIRED', 'A valid reason_code is required to defer an order', { reason_code: null }]),
            ...commonErrors,
          },
        },
      },
      '/{order_ref}/defer': {
        post: {
          tags: ['Dispatch'],
          summary: 'Defer a confirmed order to the next operating day',
          description:
            'Role: dispatcher. Requires a coded reason; `DISPATCHER_OVERRIDE` also needs `reason_note`. The order goes straight ' +
            'back into the confirmed pool for the new date; after MAX_DEFERRALS (default 3) it becomes `not_run` (AGED_OUT).',
          security: secured,
          parameters: [orderRefParam],
          requestBody: body(DeferOrderSchema, {
            noReefer: { summary: 'No refrigerated vehicle free', value: { reason_code: 'NO_REEFER_AVAILABLE', reason_note: 'all reefers committed to trip 1' } },
            capacity: { summary: 'Weight capacity exhausted', value: { reason_code: 'CAPACITY_WEIGHT' } },
            override: { summary: 'Manual override (note required)', value: { reason_code: 'DISPATCHER_OVERRIDE', reason_note: 'Outlet closed for stock-take' } },
          }),
          responses: {
            '200': orderResponse(
              'Order — confirmed for the new date, or not_run',
              detail({ order_date: '2026-09-30', deferral_count: 1 }, [
                event('confirmed', 'deferred', 'dispatcher', '2026-09-28T12:40:00.100Z', { reason_code: 'NO_REEFER_AVAILABLE', reason_note: 'all reefers committed to trip 1' }),
                event('deferred', 'confirmed', 'system', '2026-09-28T12:40:00.104Z', { actor_id: null, reason_note: 'Returned to the confirmed pool for 2026-09-30 (deferral 1 of 3)' }),
              ]),
            ),
            '403': forbidden(false),
            '404': notFound,
            '409': err(invalidTransition('allocated', 'deferred', ['loaded'])),
            '422': err(
              ['DEFERRAL_REASON_REQUIRED', 'A valid reason_code is required to defer an order', { reason_code: null, allowed: [...CALLER_REASON_CODES] }],
            ),
            ...commonErrors,
          },
        },
      },
      '/{order_ref}/receipt': {
        post: {
          tags: ['Store'],
          summary: 'Record goods receipt for a delivered order',
          description:
            'Role: store_manager (own outlet). `received + missing + rejected` must equal `order_units`. All received → `received`, ' +
            'otherwise `disputed`. Either way the outlet counts as served.',
          security: secured,
          parameters: [orderRefParam],
          requestBody: body(ReceiptSchema, {
            full: { summary: 'Everything received', value: { received_units: 120, missing_units: 0, rejected_units: 0 } },
            short: { summary: 'Short delivery → disputed', value: { received_units: 118, missing_units: 2, rejected_units: 0, note: '2 crates short' } },
          }),
          responses: {
            '200': ok(
              'Receipt recorded',
              {
                type: 'object',
                properties: {
                  order: ref('OrderDetail'),
                  receipt: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      order_ref: { type: 'string' },
                      received_units: { type: 'integer' },
                      missing_units: { type: 'integer' },
                      rejected_units: { type: 'integer' },
                      note: { type: 'string', nullable: true },
                      received_by: { type: 'string', nullable: true },
                      received_at: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
              {
                order: detail({ status: 'disputed', vehicle_id: 'VEH001', trip_id: 1 }, [
                  event('delivered', 'disputed', 'store_manager', '2026-09-29T01:30:12.945Z', { reason_note: '2 crates short' }),
                ]),
                receipt: {
                  id: '5d0c1f0e-7f0b-4f0a-9d53-0d1f6c1f2a11',
                  order_ref: 'ORD-20260929-00042',
                  received_units: 118,
                  missing_units: 2,
                  rejected_units: 0,
                  note: '2 crates short',
                  received_by: '9595b3cf-eec1-4559-9fcc-889ef5a9280c',
                  received_at: '2026-09-29T01:30:12.940Z',
                },
              },
            ),
            '400': validation,
            '403': forbidden(),
            '404': notFound,
            '409': err(
              ['RECEIPT_ALREADY_RECORDED', 'A receipt has already been recorded for ORD-20260929-00042', { order_ref: 'ORD-20260929-00042' }],
              [
                'INVALID_STATE_TRANSITION',
                "A receipt can only be recorded for a delivered order; ORD-20260929-00042 is 'out_for_delivery'",
                { from: 'out_for_delivery', to: 'received', allowed: ['delivered'] },
              ],
            ),
            '422': err([
              'RECEIPT_UNITS_MISMATCH',
              'received + missing + rejected (1) must equal the ordered units (120)',
              { order_units: 120, received_units: 1, missing_units: 0, rejected_units: 0 },
            ]),
            ...commonErrors,
          },
        },
      },
    },
  };
}
