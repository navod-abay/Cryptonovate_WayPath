#!/usr/bin/env node
/**
 * Writes openapi.yaml from the code-first spec (src/docs/openapi.ts), so the in-service
 * Swagger UI (/docs) and the platform-wide Swagger UI never drift apart.
 *
 * No host is baked into the file. The server entry is a template, `{baseUrl}/api/orders`,
 * whose value the reader sets in Swagger UI ("Servers" box). Its initial value comes from
 * OPENAPI_BASE_URL at generation time and is left empty when that is not set.
 *
 *   npm run openapi          # regenerate
 *   npm run openapi:check    # fail if openapi.yaml is stale (for CI / pre-push)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import openapi from '../dist/docs/openapi.js';

const target = fileURLToPath(new URL('../openapi.yaml', import.meta.url));

const spec = openapi.buildOpenApiSpec({
  servers: [
    {
      url: '{baseUrl}/api/orders',
      description: 'API gateway or this service; set baseUrl to the origin of your environment',
      variables: {
        baseUrl: {
          default: (process.env.OPENAPI_BASE_URL ?? '').replace(/\/$/, ''),
          description: 'Scheme and host (and port, if any), without a trailing slash. Empty = same origin as this page.',
        },
      },
    },
  ],
});

const header =
  '# GENERATED FILE — do not edit by hand.\n' +
  '# Source: src/docs/openapi.ts. Regenerate with `npm run openapi`.\n';
const output = header + stringify(spec, { lineWidth: 120 });

if (process.argv.includes('--check')) {
  const current = (() => {
    try {
      return readFileSync(target, 'utf8').replace(/\r\n/g, '\n');
    } catch {
      return '';
    }
  })();
  if (current !== output) {
    console.error('openapi.yaml is out of date. Run `npm run openapi` and commit the result.');
    process.exit(1);
  }
  console.log('openapi.yaml is up to date.');
} else {
  writeFileSync(target, output);
  const paths = Object.keys(spec.paths).length;
  const operations = Object.values(spec.paths).reduce((n, p) => n + Object.keys(p).length, 0);
  console.log(`Wrote openapi.yaml (${paths} paths, ${operations} operations).`);
}
