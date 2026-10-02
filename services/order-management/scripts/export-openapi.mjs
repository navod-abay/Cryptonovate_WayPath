#!/usr/bin/env node
/**
 * Writes openapi.yaml from the code-first spec (src/docs/openapi.ts), so the in-service
 * Swagger UI (/docs) and the platform-wide one (http://localhost:8080) never drift apart.
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
    { url: 'http://localhost/api/orders', description: 'Via API gateway' },
    { url: 'http://localhost:3002/api/orders', description: 'Direct (local container)' },
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
