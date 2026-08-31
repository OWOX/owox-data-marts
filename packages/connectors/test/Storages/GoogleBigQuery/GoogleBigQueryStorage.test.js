import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { loadGasClass } from '../../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const abstractStoragePath = path.join(__dirname, '../../../src/Core/AbstractStorage.js');
const dateUtilsPath = path.join(__dirname, '../../../src/Core/Utils/DateUtils.js');
const storagePath = path.join(
  __dirname,
  '../../../src/Storages/GoogleBigQuery/GoogleBigQueryStorage.js'
);

// getBigQueryClient() calls the real require('google-auth-library') at runtime
// (set as a global by connector-runner.js in production); vm.runInThisContext
// has no `require` of its own, so we provide the real one here too — this
// exercises the actual OAuth2Client, not a stand-in for it.
globalThis.require = createRequire(import.meta.url);

loadGasClass(abstractStoragePath);
loadGasClass(dateUtilsPath);
loadGasClass(storagePath);
const proto = globalThis.GoogleBigQueryStorage.prototype;

const configValue = value => ({ value });

const fakeStorage = (configOverrides = {}) => ({
  _bigqueryClient: null,
  config: {
    OAuthAccessToken: configValue('access-token'),
    OAuthRefreshToken: configValue('refresh-token'),
    OAuthClientId: configValue('client-id'),
    OAuthClientSecret: configValue('client-secret'),
    OAuthAccessTokenExpiry: configValue(1234567890),
    ProjectID: configValue('gcp-project'),
    ...configOverrides,
  },
});

describe('getBigQueryClient', () => {
  let capturedAuthClients;

  beforeEach(() => {
    capturedAuthClients = [];
    // Stand-in for @google-cloud/bigquery: real BigQuery would open network
    // connections, so we only need to capture the authClient it was built with.
    globalThis.BigQuery = class {
      constructor({ authClient }) {
        capturedAuthClients.push(authClient);
      }
    };
  });

  it('passes the access token expiry through to the OAuth2Client credentials', () => {
    proto.getBigQueryClient.call(fakeStorage());

    expect(capturedAuthClients).toHaveLength(1);
    expect(capturedAuthClients[0].credentials.expiry_date).toBe(1234567890);
  });

  it('omits expiry_date when the config has none, instead of sending an invalid value', () => {
    proto.getBigQueryClient.call(fakeStorage({ OAuthAccessTokenExpiry: configValue(null) }));

    expect(capturedAuthClients[0].credentials.expiry_date).toBeUndefined();
  });

  it('reuses the same client across calls instead of rebuilding it from the static token', () => {
    const storage = fakeStorage();

    const first = proto.getBigQueryClient.call(storage);
    const second = proto.getBigQueryClient.call(storage);

    expect(second).toBe(first);
    expect(capturedAuthClients).toHaveLength(1);
  });

  it('refreshes an expired token on the next query and keeps it for the rest of the run', async () => {
    // The production regression this whole fix targets: a token that expires
    // mid-run must be refreshed via the refresh token, and the refreshed token
    // must survive to later queries instead of being rebuilt from the stale one.
    const storage = fakeStorage({
      OAuthAccessTokenExpiry: configValue(Date.now() - 60_000),
    });
    proto.getBigQueryClient.call(storage);
    const authClient = capturedAuthClients[0];
    // Stub only the token-endpoint HTTP call: the real OAuth2Client refresh
    // logic (expiry detection, grant exchange, credential update) runs as-is.
    authClient.transporter.request = vi.fn(async () => ({
      data: { access_token: 'refreshed-token', expires_in: 3600, token_type: 'Bearer' },
    }));

    // First query after expiry: the library must detect the past expiry_date
    // and exchange the refresh token.
    await authClient.getRequestHeaders();
    expect(authClient.transporter.request).toHaveBeenCalledTimes(1);
    expect(authClient.credentials.access_token).toBe('refreshed-token');

    // A later executeQuery reuses the cached client — and with it the
    // refreshed token: no client rebuild, no second refresh round-trip.
    proto.getBigQueryClient.call(storage);
    expect(capturedAuthClients).toHaveLength(1);
    await authClient.getRequestHeaders();
    expect(authClient.transporter.request).toHaveBeenCalledTimes(1);
  });

  it('passes expiry_date 0 through, which google-auth-library itself treats as no known expiry', () => {
    proto.getBigQueryClient.call(fakeStorage({ OAuthAccessTokenExpiry: configValue(0) }));
    const authClient = capturedAuthClients[0];

    // `??` keeps the 0 intact on our side (|| would have dropped it)...
    expect(authClient.credentials.expiry_date).toBe(0);
    // ...but the library's own isTokenExpiring() uses a falsy check, so an
    // exact epoch-0 expiry never triggers a refresh either way. Pinned here so
    // nobody "fixes" our passthrough expecting a refresh the library won't do;
    // acceptable in practice, since a real expiry timestamp is never 0.
    expect(authClient.isTokenExpiring()).toBe(false);
  });
});

describe('buildMergeQuery partition pruning', () => {
  // A report-node shaped storage: date is the partition column and part of the
  // unique key, records span three days. Built on the real prototype so the
  // inherited helpers (stringifyNeastedFields, obfuscateSpecialCharacters,
  // formatColumnValue) run for real.
  const mergeStorage = (overrides = {}) =>
    Object.assign(Object.create(proto), {
      config: {
        DestinationDatasetID: configValue('project.dataset'),
        DestinationTableName: configValue('reddit_ads_report'),
      },
      uniqueKeyColumns: ['ad_id', 'date'],
      schema: {
        ad_id: { type: 'string' },
        date: { type: 'date', GoogleBigQueryPartitioned: true },
        impressions: { type: 'integer' },
      },
      existingColumns: {
        ad_id: { name: 'ad_id', type: 'STRING' },
        date: { name: 'date', type: 'DATE', isPartitioningColumn: true },
        impressions: { name: 'impressions', type: 'INT64' },
      },
      updatedRecordsBuffer: {
        'ad_1|2026-08-30': { ad_id: 'ad_1', date: new Date('2026-08-30'), impressions: 10 },
        'ad_1|2026-08-29': { ad_id: 'ad_1', date: new Date('2026-08-29'), impressions: 7 },
        'ad_2|2026-08-31': { ad_id: 'ad_2', date: new Date('2026-08-31'), impressions: 3 },
      },
      ...overrides,
    });

  const bufferKeys = storage => Object.keys(storage.updatedRecordsBuffer);

  it('bounds the target to the batch date range so BigQuery can prune partitions', () => {
    const storage = mergeStorage();

    const query = storage.buildMergeQuery(bufferKeys(storage));

    expect(query).toContain("AND target.date BETWEEN DATE '2026-08-29' AND DATE '2026-08-31'");
  });

  it('keeps the unique-key join conditions unchanged next to the range predicate', () => {
    const storage = mergeStorage();

    const query = storage.buildMergeQuery(bufferKeys(storage));

    expect(query).toContain('target.ad_id = source.ad_id');
    expect(query).toContain('target.date = source.date');
  });

  it('emits no predicate for entity nodes whose schema declares no partition column', () => {
    // The `ads` node regression guard: uniqueKeys ["id"], no date field at all.
    const storage = mergeStorage({
      uniqueKeyColumns: ['id'],
      schema: { id: { type: 'string' }, name: { type: 'string' } },
      existingColumns: {
        id: { name: 'id', type: 'STRING' },
        name: { name: 'name', type: 'STRING' },
      },
      updatedRecordsBuffer: { ad_1: { id: 'ad_1', name: 'Ad One' } },
    });

    const query = storage.buildMergeQuery(bufferKeys(storage));

    expect(query).not.toContain('BETWEEN');
    expect(query).toContain('ON target.id = source.id');
  });

  it('suppresses the predicate when any record lacks a partition value', () => {
    // A range that misses one record's partition would hide its target row
    // and produce a duplicate insert, so one gap disables pruning for the
    // whole batch.
    const storage = mergeStorage();
    storage.updatedRecordsBuffer['ad_1|2026-08-30'].date = null;

    expect(storage.buildPartitionPredicate(bufferKeys(storage))).toBeNull();
  });

  it('suppresses the predicate when the partition column is not part of the unique key', () => {
    // Without `target.date = source.date` in the ON clause, bounding the
    // target's date would hide matching rows in out-of-range partitions and
    // the MERGE would insert duplicates instead of updating them.
    const storage = mergeStorage({ uniqueKeyColumns: ['ad_id'] });

    expect(storage.buildPartitionPredicate(bufferKeys(storage))).toBeNull();
  });

  it('suppresses the predicate when the destination table predates the partition flag', () => {
    const storage = mergeStorage({
      existingColumns: {
        ad_id: { name: 'ad_id', type: 'STRING' },
        impressions: { name: 'impressions', type: 'INT64' },
      },
    });

    expect(storage.buildPartitionPredicate(bufferKeys(storage))).toBeNull();
  });

  it('suppresses the predicate when a value does not look like a date literal', () => {
    // Values come from vendor APIs; anything that could escape the quoted
    // literal (or is plain garbage) must disable pruning, not corrupt the SQL.
    const storage = mergeStorage();
    storage.updatedRecordsBuffer['ad_1|2026-08-30'].date = "2026-08-30' OR '1'='1";

    expect(storage.buildPartitionPredicate(bufferKeys(storage))).toBeNull();
  });

  it('suppresses the predicate for zone-bearing timestamps, whose string order is not time order', () => {
    // '2026-08-30 23:00:00+10:00' is 13:00 UTC — lexicographically the max of
    // this batch but chronologically its min. A range built from string
    // comparison would exclude the 14:00Z row and duplicate it on merge.
    const storage = mergeStorage({
      existingColumns: {
        ad_id: { name: 'ad_id', type: 'STRING' },
        date: { name: 'date', type: 'TIMESTAMP', isPartitioningColumn: true },
        impressions: { name: 'impressions', type: 'INT64' },
      },
      updatedRecordsBuffer: {
        a: { ad_id: 'ad_1', date: '2026-08-30 14:00:00Z', impressions: 1 },
        b: { ad_id: 'ad_2', date: '2026-08-30 23:00:00+10:00', impressions: 2 },
      },
    });

    expect(storage.buildPartitionPredicate(bufferKeys(storage))).toBeNull();
  });

  it('normalizes the T separator so ISO-style datetimes still produce a predicate', () => {
    const storage = mergeStorage({
      existingColumns: {
        ad_id: { name: 'ad_id', type: 'STRING' },
        date: { name: 'date', type: 'DATETIME', isPartitioningColumn: true },
        impressions: { name: 'impressions', type: 'INT64' },
      },
      updatedRecordsBuffer: {
        a: { ad_id: 'ad_1', date: '2026-08-30T10:00:00', impressions: 1 },
        b: { ad_id: 'ad_2', date: '2026-08-31 09:30:00', impressions: 2 },
      },
    });

    expect(storage.buildPartitionPredicate(bufferKeys(storage))).toBe(
      "target.date BETWEEN DATETIME '2026-08-30 10:00:00' AND DATETIME '2026-08-31 09:30:00'"
    );
  });

  it('suppresses the predicate for an impossible calendar date', () => {
    // Shape-valid but not a real date: SAFE_CAST makes it NULL in source
    // rows, but DATE '2026-02-31' in the predicate would fail the whole query.
    const storage = mergeStorage();
    storage.updatedRecordsBuffer['ad_1|2026-08-30'].date = '2026-02-31';

    expect(storage.buildPartitionPredicate(bufferKeys(storage))).toBeNull();
  });

  it('suppresses the predicate for an out-of-range time', () => {
    const storage = mergeStorage({
      existingColumns: {
        ad_id: { name: 'ad_id', type: 'STRING' },
        date: { name: 'date', type: 'DATETIME', isPartitioningColumn: true },
        impressions: { name: 'impressions', type: 'INT64' },
      },
      updatedRecordsBuffer: {
        a: { ad_id: 'ad_1', date: '2026-08-30 25:00:00', impressions: 1 },
      },
    });

    expect(storage.buildPartitionPredicate(bufferKeys(storage))).toBeNull();
  });

  it('follows the table partitioning column when the schema flags a different field', () => {
    // LinkedIn flags both dateRangeStart and dateRangeEnd; existing tables
    // are partitioned by dateRangeEnd. Table truth must win over the schema.
    const storage = mergeStorage({
      uniqueKeyColumns: ['dateRangeStart', 'dateRangeEnd', 'pivotValues'],
      existingColumns: {
        dateRangeStart: { name: 'dateRangeStart', type: 'DATE' },
        dateRangeEnd: { name: 'dateRangeEnd', type: 'DATE', isPartitioningColumn: true },
        pivotValues: { name: 'pivotValues', type: 'STRING' },
      },
      updatedRecordsBuffer: {
        a: { dateRangeStart: '2026-08-29', dateRangeEnd: '2026-08-30', pivotValues: 'x' },
        b: { dateRangeStart: '2026-08-30', dateRangeEnd: '2026-08-31', pivotValues: 'y' },
      },
    });

    expect(storage.buildPartitionPredicate(bufferKeys(storage))).toBe(
      "target.dateRangeEnd BETWEEN DATE '2026-08-30' AND DATE '2026-08-31'"
    );
  });

  it('uses a TIMESTAMP literal for a TIMESTAMP partition column', () => {
    const storage = mergeStorage({
      existingColumns: {
        ad_id: { name: 'ad_id', type: 'STRING' },
        date: { name: 'date', type: 'TIMESTAMP', isPartitioningColumn: true },
        impressions: { name: 'impressions', type: 'INT64' },
      },
      updatedRecordsBuffer: {
        a: { ad_id: 'ad_1', date: '2026-08-30 10:00:00', impressions: 1 },
        b: { ad_id: 'ad_2', date: '2026-08-31 09:30:00', impressions: 2 },
      },
    });

    expect(storage.buildPartitionPredicate(bufferKeys(storage))).toBe(
      "target.date BETWEEN TIMESTAMP '2026-08-30 10:00:00' AND TIMESTAMP '2026-08-31 09:30:00'"
    );
  });
});
