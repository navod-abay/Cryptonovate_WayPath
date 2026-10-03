import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOpenApiSpec } from '../../src/docs/openapi.js';
import ordersRouter from '../../src/routes/orders.routes.js';

type Operation = {
  operationId?: string;
  security?: unknown[];
  requestBody?: { content: { 'application/json': { examples?: Record<string, unknown> } } };
  responses: Record<string, { content?: { 'application/json'?: { example?: unknown; examples?: Record<string, unknown> } } }>;
};

const spec = buildOpenApiSpec() as { paths: Record<string, Record<string, Operation>> };
const operations = Object.entries(spec.paths).flatMap(([path, ops]) =>
  Object.entries(ops).map(([method, op]) => ({ key: `${method.toUpperCase()} ${path}`, op })),
);

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
}

test('every Express route is documented, and nothing is documented that does not exist', () => {
  const routed = (ordersRouter.stack as Layer[])
    .filter((l) => l.route)
    .flatMap((l) =>
      Object.keys(l.route!.methods).map((m) => `${m.toUpperCase()} ${l.route!.path.replace(/:(\w+)/g, '{$1}')}`),
    )
    .sort();
  assert.deepEqual(operations.map((o) => o.key).sort(), routed);
});

test('operationIds are present and unique', () => {
  const ids = operations.map((o) => o.op.operationId);
  assert.ok(ids.every(Boolean));
  assert.equal(new Set(ids).size, ids.length);
});

test('every request body ships at least one example', () => {
  for (const { key, op } of operations) {
    if (!op.requestBody) continue;
    const examples = op.requestBody.content['application/json'].examples ?? {};
    assert.ok(Object.keys(examples).length > 0, `${key} has no request example`);
  }
});

test('every success and error response ships an example', () => {
  for (const { key, op } of operations) {
    for (const [status, response] of Object.entries(op.responses)) {
      const media = response.content?.['application/json'];
      assert.ok(media?.example !== undefined || Object.keys(media?.examples ?? {}).length > 0, `${key} ${status} has no example`);
    }
  }
});

test('only /health is public', () => {
  for (const { key, op } of operations) {
    const isPublic = Array.isArray(op.security) && op.security.length === 0;
    assert.equal(isPublic, key === 'GET /health', key);
  }
});
