// packages/connectors/tests/regression/linkedinpages-dst-end-date.test.js
//
// LinkedIn Pages treats the analytics end bound as EXCLUSIVE, so
// LinkedInPagesSource.fetchData() advances endDate by one day before building
// the timeIntervals range. The adjustment mixed two clocks: `new Date("YYYY-MM-DD")`
// parses as UTC midnight, but `setDate`/`getDate` read and write LOCAL calendar
// fields, and the result is truncated back to a date with `toISOString()` (UTC
// again).
//
// On a spring-forward date in a west-of-UTC zone the local wall clock loses an
// hour, which is exactly the slack the UTC-midnight instant had: 2026-03-08 in
// America/Los_Angeles is UTC 2026-03-08T00:00Z = local 2026-03-07 16:00 PST;
// +1 local day = 2026-03-08 16:00 PDT = UTC 2026-03-08T23:00Z, whose ISO date is
// still 2026-03-08. The +1 silently becomes a no-op and, because the bound is
// exclusive, the LAST DAY OF DATA IS DROPPED with no error -- the run reports
// success with a short window.
//
// XAds/Source.js does the same +1 with setUTCDate/getUTCDate ("Use UTC methods
// to avoid DST shifts") and is the reference shape.
//
// The test pins the timezone via the TZ env var and re-spawns itself, because
// Node reads TZ once per process for Date's local-time methods.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const DST_TZ = 'America/Los_Angeles';
// 2026-03-08 is the US spring-forward date; 2026-03-09 is an ordinary day used
// as the control, so a failure points at DST rather than at the +1 in general.
const CASES = [
  { endDate: '2026-03-08', expected: '2026-03-09' },
  { endDate: '2026-03-09', expected: '2026-03-10' },
];

// The source dispatches on nodeName; both real nodes are time-series and route
// through fetchOrganizationStats, so stubbing that captures the adjusted bound.
async function adjustedEndDateFor(endDate) {
  const { LinkedInPagesSource } = await import('../../src/Sources/LinkedInPages/Source.js');
  const captured = {};
  const self = {
    fieldsSchema: { follower_statistics_time_bound: { isTimeSeries: true, uniqueKeys: [] } },
    async fetchOrganizationStats(args) {
      captured.endDate = args.endDate;
      return [];
    },
    transformFollowerStatisticsTimeBound() {
      return [];
    },
  };
  await LinkedInPagesSource.prototype.fetchData.call(self, {
    nodeName: 'follower_statistics_time_bound',
    fields: [],
    accountId: '123',
    startDate: '2026-03-01',
    endDate,
  });
  return captured.endDate;
}

if (process.env.OWOX_DST_CHILD === '1') {
  for (const { endDate, expected } of CASES) {
    const actual = await adjustedEndDateFor(endDate);
    if (actual !== expected) {
      console.error(`FAIL ${endDate} -> ${actual} (expected ${expected})`);
      process.exit(1);
    }
  }
  process.exit(0);
}

test('advances the exclusive end bound by a full day across a DST spring-forward', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    env: { ...process.env, TZ: DST_TZ, OWOX_DST_CHILD: '1' },
    encoding: 'utf8',
  });
  assert.strictEqual(
    result.status,
    0,
    `end-date adjustment is not DST-safe in ${DST_TZ}:\n${result.stderr}`
  );
});
