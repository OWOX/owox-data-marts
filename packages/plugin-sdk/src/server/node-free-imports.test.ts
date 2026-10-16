// @vitest-environment node
import { readFileSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const IMPORT = /\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

// Workers bundles take server/index.ts; only server/node may reach Node modules or undici.
it('keeps the Fetch API entry and everything it imports free of Node modules', () => {
  const seen = new Set<string>();
  const pending = [resolve(here, 'index.ts'), resolve(here, 'requester.ts')];
  const found: string[] = [];
  for (let file = pending.pop(); file; file = pending.pop()) {
    if (seen.has(file)) continue;
    seen.add(file);
    for (const [, specifier] of readFileSync(file, 'utf8').matchAll(IMPORT)) {
      if (specifier!.startsWith('.')) {
        pending.push(resolve(dirname(file), specifier!.replace(/\.js$/, '.ts')));
      } else if (isBuiltin(specifier!) || /^undici(\/|$)/.test(specifier!)) {
        found.push(`${file}: ${specifier}`);
      }
    }
  }

  expect(found).toEqual([]);
  expect([...seen].some(file => file.endsWith('/credentials.ts'))).toBe(true);
});
