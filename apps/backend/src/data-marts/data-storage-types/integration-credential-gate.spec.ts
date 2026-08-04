/**
 * Keeps the CI credential gate honest.
 *
 * Every live suite is wrapped in `describeIfCredentials`, which degrades to `describe.skip` when
 * ITS OWN variables are absent — so `test/integration/setup-env.ts` fails the CI run when a
 * credential is missing, rather than letting jest exit 0 having verified nothing. That protection
 * is only as good as its variable list: a variable the gate omits still skips its suite silently,
 * and the run stays green. Two were already omitted (`ATHENA_OUTPUT_BUCKET`, `DATABRICKS_SCHEMA`).
 *
 * Both sides are read as SOURCE TEXT rather than imported: importing `setup-env.ts` runs dotenv
 * and, under CI=true, throws by design — a unit test must not depend on that.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const INTEGRATION_DIR = join(__dirname, '..', '..', '..', 'test', 'integration');

const SUITE_FILES: Record<string, string> = {
  BigQuery: 'bigquery.integration.ts',
  Athena: 'athena.integration.ts',
  Redshift: 'redshift.integration.ts',
  Snowflake: 'snowflake.integration.ts',
  Databricks: 'databricks.integration.ts',
};

const readSuite = (file: string): string => readFileSync(join(INTEGRATION_DIR, file), 'utf8');

/** The gate's declared list, parsed out of its object literal. */
function gateCredentials(): Record<string, string[]> {
  const source = readSuite('setup-env.ts');
  const body = source.slice(
    source.indexOf('const CREDENTIALS_BY_SUITE'),
    source.indexOf('if (process.env.CI')
  );
  const result: Record<string, string[]> = {};
  for (const [, suite, vars] of body.matchAll(/(\w+):\s*\[([^\]]*)\]/g)) {
    result[suite] = [...vars.matchAll(/'([^']+)'/g)].map(m => m[1]);
  }
  return result;
}

/**
 * What a suite ACTUALLY requires: the env vars behind the identifiers in its own
 * `*_CREDENTIALS_AVAILABLE = !!( … )` expression.
 */
function suiteCredentials(file: string): string[] {
  const source = readSuite(file);
  const envByLocal = new Map(
    [...source.matchAll(/const (\w+) = process\.env\.(\w+)/g)].map(m => [m[1], m[2]])
  );
  const predicate = source.match(/const \w*CREDENTIALS_AVAILABLE = !!\(([\s\S]*?)\);/);
  if (!predicate) throw new Error(`No *_CREDENTIALS_AVAILABLE predicate found in ${file}`);
  return [...predicate[1].matchAll(/\w+/g)]
    .map(m => envByLocal.get(m[0]))
    .filter((v): v is string => v != null);
}

describe('live integration suites — CI credential gate', () => {
  const gate = gateCredentials();

  it('covers every live suite', () => {
    expect(Object.keys(gate).sort()).toEqual(Object.keys(SUITE_FILES).sort());
  });

  it.each(Object.entries(SUITE_FILES))(
    '%s: the gate requires exactly what the suite itself checks',
    (suite, file) => {
      // Sets, not arrays: the order a predicate lists its variables in is not meaningful.
      expect([...new Set(gate[suite])].sort()).toEqual([...new Set(suiteCredentials(file))].sort());
    }
  );
});
