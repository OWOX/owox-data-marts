import { config } from 'dotenv';
import { resolve } from 'path';

// Load root .env first (base configuration)
config({ path: resolve(__dirname, '..', '..', '..', '..', '.env') });

// Load root .env.tests with override — test values take priority over .env
config({ path: resolve(__dirname, '..', '..', '..', '..', '.env.tests'), override: true });

/**
 * Every live suite is gated by `describeIfCredentials`, which degrades to `describe.skip` when
 * its variables are absent. That is what makes the suites runnable locally — but in CI it turns
 * an expired or unset secret into a GREEN run: every test is skipped, jest exits 0, and the
 * failure notification never fires. Since these suites hold the only assertions that check
 * actual NUMBERS (the unit tests can only check SQL text), a silent skip means the arithmetic
 * stopped being verified without anyone being told.
 *
 * So in CI, missing credentials are a hard failure. Locally (CI unset) nothing changes.
 */
/**
 * MUST list exactly the variables each suite's own `*_CREDENTIALS_AVAILABLE` predicate reads — a
 * variable missing here is a variable whose absence still degrades that suite to `describe.skip`
 * while this gate reports everything present, which is the exact failure the gate exists to
 * prevent. `integration-credential-gate.spec.ts` compares the two lists so they cannot drift.
 */
const CREDENTIALS_BY_SUITE: Record<string, string[]> = {
  BigQuery: ['BQ_PROJECT_ID', 'BQ_DATASET', 'BQ_SERVICE_ACCOUNT_KEY'],
  Athena: [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'ATHENA_REGION',
    'ATHENA_OUTPUT_BUCKET',
    'ATHENA_DATABASE',
  ],
  Redshift: [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'REDSHIFT_REGION',
    'REDSHIFT_WORKGROUP_NAME',
    'REDSHIFT_DATABASE',
  ],
  Snowflake: [
    'SNOWFLAKE_ACCOUNT',
    'SNOWFLAKE_USERNAME',
    'SNOWFLAKE_PASSWORD',
    'SNOWFLAKE_DATABASE',
    'SNOWFLAKE_SCHEMA',
    'SNOWFLAKE_WAREHOUSE',
  ],
  Databricks: [
    'DATABRICKS_HOST',
    'DATABRICKS_TOKEN',
    'DATABRICKS_HTTP_PATH',
    'DATABRICKS_CATALOG',
    'DATABRICKS_SCHEMA',
  ],
};

if (process.env.CI === 'true') {
  const missing = Object.entries(CREDENTIALS_BY_SUITE)
    .flatMap(([suite, vars]) => vars.filter(v => !process.env[v]).map(v => `${suite}: ${v}`))
    .sort();
  if (missing.length > 0) {
    throw new Error(
      `Integration tests are running in CI without credentials, so every suite would silently ` +
        `skip and the run would pass while verifying nothing. Missing: ${missing.join(', ')}`
    );
  }
}
