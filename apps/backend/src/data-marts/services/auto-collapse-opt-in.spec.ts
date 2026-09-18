/**
 * The automatic collapse is opt-in, and the opt-in is the feature's whole safety argument: a
 * stored report OWOX delivers is collapsed, and every other reader of the same composition path
 * keeps returning the raw projection — an ad-hoc HTTP Data query, the MCP tools, `apps/ctl`, the
 * Looker Studio cache fill, copy-as-Data-Mart, and the report's save-time dry run.
 *
 * `stream-http-data.service.ts` is on the list and is the subtle one: the SAME endpoint serves an
 * ad-hoc HTTP Data caller, who gets raw rows, and an Excel report's add-in, for whom that fetch
 * IS the delivery. It collapses only for the second, keyed on the report's destination.
 *
 * That guarantee is NEGATIVE, so no single behavioural test can hold it: it is a statement about
 * every call site that does NOT exist. One behavioural test pins the HTTP Data path, and this pins
 * the rest of them at once by asserting the call sites themselves. A new `applyAutoCollapse(` in
 * any other service fails here, which is the moment to decide whether that caller should really
 * collapse — not after a customer's ad-hoc query starts returning different rows.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC_ROOT = join(__dirname, '..', '..');

const ALLOWED_CALLERS = [
  'data-marts/use-cases/get-report-generated-sql.service.ts',
  'data-marts/use-cases/run-report.service.ts',
  'data-marts/use-cases/stream-http-data.service.ts',
];

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      yield full;
    }
  }
}

describe('applyAutoCollapse opt-in', () => {
  it('is called from exactly the three services that deliver a stored report', () => {
    const callers = [...walk(SRC_ROOT)]
      .filter(file => /\bapplyAutoCollapse\s*\(/.test(readFileSync(file, 'utf8')))
      .map(file =>
        file
          .slice(SRC_ROOT.length + 1)
          .split(/[\\/]/)
          .join('/')
      )
      // Its own definition is not a call site.
      .filter(file => !file.endsWith('services/auto-collapse.resolver.ts'))
      .sort();

    expect(callers).toEqual([...ALLOWED_CALLERS].sort());
  });
});
