import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { loadGasClass } from '../../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const abstractStoragePath = path.join(__dirname, '../../../src/Core/AbstractStorage.js');
const dateUtilsPath = path.join(__dirname, '../../../src/Core/Utils/DateUtils.js');
const asyncUtilsPath = path.join(__dirname, '../../../src/Core/Utils/AsyncUtils.js');
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
loadGasClass(asyncUtilsPath);
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
        logMessage() {},
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

  it('skips records without a partition value instead of disabling pruning', () => {
    // A NULL partition value emits SAFE_CAST(NULL ...), which never equals
    // any target value — the record is INSERT-only either way, so the range
    // can ignore it and still cover every matchable row.
    const storage = mergeStorage();
    storage.updatedRecordsBuffer['ad_1|2026-08-30'].date = null;

    expect(storage.buildPartitionPredicate(bufferKeys(storage))).toBe(
      "target.date BETWEEN DATE '2026-08-29' AND DATE '2026-08-31'"
    );
  });

  it('emits no predicate when every record lacks a partition value', () => {
    const storage = mergeStorage();
    for (const key of Object.keys(storage.updatedRecordsBuffer)) {
      storage.updatedRecordsBuffer[key].date = null;
    }

    expect(storage.buildPartitionPredicate(bufferKeys(storage))).toBeNull();
  });

  it('logs the suppression reason once per run, not once per batch', () => {
    const messages = [];
    const storage = mergeStorage({ uniqueKeyColumns: ['ad_id'] });
    storage.config.logMessage = message => messages.push(message);

    storage.buildPartitionPredicate(bufferKeys(storage));
    storage.buildPartitionPredicate(bufferKeys(storage));

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("'date' is not part of the unique key");
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

describe('getAListOfExistingColumns', () => {
  // The only production source of isPartitioningColumn — if either parsing
  // branch stops matching, the predicate silently never fires while every
  // other test still passes. These two pin the producers.
  const columnsStorage = () =>
    Object.assign(Object.create(proto), {
      config: {
        DestinationProjectID: configValue('project'),
        DestinationDatasetName: configValue('dataset'),
        DestinationDatasetID: configValue('project.dataset'),
        DestinationTableName: configValue('reddit_ads_report'),
      },
    });

  it('marks the partitioning column in the BigQuery row/field result shape', async () => {
    const storage = columnsStorage();
    storage.executeQuery = async () => ({
      rows: [
        { f: [{ v: 'ad_id' }, { v: 'STRING' }, { v: 'NO' }] },
        { f: [{ v: 'date' }, { v: 'DATE' }, { v: 'YES' }] },
      ],
    });

    const columns = await storage.getAListOfExistingColumns();

    expect(columns.date).toEqual({ name: 'date', type: 'DATE', isPartitioningColumn: true });
    expect(columns.ad_id.isPartitioningColumn).toBe(false);
  });

  it('marks the partitioning column in the plain array result shape', async () => {
    const storage = columnsStorage();
    storage.executeQuery = async () => [
      { column_name: 'ad_id', data_type: 'STRING', is_partitioning_column: 'NO' },
      { column_name: 'date', data_type: 'DATE', is_partitioning_column: 'YES' },
    ];

    const columns = await storage.getAListOfExistingColumns();

    expect(columns.date.isPartitioningColumn).toBe(true);
    expect(columns.ad_id.isPartitioningColumn).toBe(false);
  });
});

describe('createTableIfItDoesntExist partitioning', () => {
  const createStorage = schema =>
    Object.assign(Object.create(proto), {
      config: {
        DestinationDatasetID: configValue('project.dataset'),
        DestinationTableName: configValue('t'),
        logMessage() {},
      },
      uniqueKeyColumns: ['id'],
      schema,
      getSelectedFields: () => Object.keys(schema),
      getColumnType: column => schema[column].type,
    });

  it('partitions by the flagged DATE column and records it as table truth', async () => {
    const storage = createStorage({
      id: { type: 'STRING' },
      date: { type: 'DATE', GoogleBigQueryPartitioned: true },
    });
    let query;
    storage.executeQuery = async sql => {
      query = sql;
    };

    const columns = await storage.createTableIfItDoesntExist();

    expect(query).toContain('PARTITION BY date');
    expect(columns.date.isPartitioningColumn).toBe(true);
  });

  it('emits TIMESTAMP_TRUNC DDL for a TIMESTAMP partition column', async () => {
    const storage = createStorage({
      id: { type: 'STRING' },
      ts: { type: 'TIMESTAMP', GoogleBigQueryPartitioned: true },
    });
    let query;
    storage.executeQuery = async sql => {
      query = sql;
    };

    await storage.createTableIfItDoesntExist();

    expect(query).toContain('PARTITION BY TIMESTAMP_TRUNC(ts, DAY)');
  });

  it('skips partitioning for a non-date flag and says so in the log', async () => {
    const storage = createStorage({
      id: { type: 'STRING', GoogleBigQueryPartitioned: true },
    });
    const messages = [];
    storage.config.logMessage = message => messages.push(message);
    let query;
    storage.executeQuery = async sql => {
      query = sql;
    };

    const columns = await storage.createTableIfItDoesntExist();

    expect(query).not.toContain('PARTITION BY');
    expect(columns.id.isPartitioningColumn).toBeUndefined();
    expect(messages.some(m => m.includes("Column 'id'"))).toBe(true);
  });
});

describe('formatColumnValue date handling', () => {
  const bare = () => Object.create(proto);

  it('formats a Date in a TIMESTAMP column as a UTC timestamp string', () => {
    // Previously fell through to String(date) — a locale string that
    // SAFE_CAST degrades to NULL, silently losing the value.
    const value = proto.formatColumnValue.call(
      bare(),
      new Date('2026-08-30T10:00:00Z'),
      'TIMESTAMP'
    );

    expect(value).toBe('2026-08-30 10:00:00');
  });

  it('recognizes cross-realm Date objects via their constructor name', () => {
    // instanceof fails across realms (the Apps Script target); the fallback
    // matches AbstractStorage's sibling helpers.
    const crossRealmDate = {
      constructor: { name: 'Date' },
      toISOString: () => '2026-08-30T00:00:00.000Z',
    };

    const value = proto.formatColumnValue.call(bare(), crossRealmDate, 'DATE');

    expect(value).toBe('2026-08-30');
  });

  it('normalizes the T separator for datetime strings in the shared helper', () => {
    const value = proto.formatColumnValue.call(bare(), '2026-08-30T10:00:00', 'DATETIME');

    expect(value).toBe('2026-08-30 10:00:00');
  });
});

describe('executeQuery transient-error retries', () => {
  // Shape of a failure from @google-cloud/common's ApiError: `code` is the HTTP status
  // and `errors[].reason` is BigQuery's own classification of what went wrong.
  const apiError = (reason, code = 500) =>
    Object.assign(
      new Error('Error encountered during execution. Retrying may solve the problem.'),
      {
        code,
        errors: reason ? [{ reason, message: 'Error encountered during execution.' }] : undefined,
      }
    );

  const retryingStorage = ({ failures, error = apiError('backendError'), retries = 3 } = {}) => {
    const waited = [];
    const messages = [];
    let attempts = 0;

    // Built on the prototype so executeQuery can reach its own helpers.
    const storage = Object.assign(Object.create(proto), {
      config: {
        MaxFetchRetries: configValue(retries),
        InitialRetryDelay: configValue(1000),
        logMessage: message => messages.push(message),
      },
      getBigQueryClient: () => ({
        createQueryJob: async () => {
          attempts += 1;
          if (attempts <= failures) {
            throw error;
          }
          return [{ getQueryResults: async () => [[{ ok: true }]] }];
        },
      }),
    });

    return { storage, waited, messages, attemptCount: () => attempts };
  };

  let originalDelay;

  beforeEach(() => {
    originalDelay = globalThis.AsyncUtils.delay;
  });

  afterEach(() => {
    globalThis.AsyncUtils.delay = originalDelay;
  });

  const withRecordedDelays = waited => {
    globalThis.AsyncUtils.delay = async ms => {
      waited.push(ms);
    };
  };

  it('retries a backendError and returns the rows the retry produced', async () => {
    // The production failure: one MERGE batch out of a thousand hit a temporary
    // BigQuery fault and took the whole run down with it.
    const { storage, waited, attemptCount } = retryingStorage({ failures: 1 });
    withRecordedDelays(waited);

    const rows = await proto.executeQuery.call(storage, 'MERGE INTO t ...');

    expect(rows).toEqual([{ ok: true }]);
    expect(attemptCount()).toBe(2);
    expect(waited).toHaveLength(1);
  });

  it('says in the run log that it is retrying, and why', async () => {
    const { storage, waited, messages } = retryingStorage({ failures: 1 });
    withRecordedDelays(waited);

    await proto.executeQuery.call(storage, 'MERGE INTO t ...');

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('backendError');
    expect(messages[0]).toContain('attempt 2 of 3');
  });

  it('gives up after the configured attempts and rethrows the original error', async () => {
    // The caller must see BigQuery's own error, not a wrapper that hides the reason.
    const error = apiError('backendError');
    const { storage, waited, attemptCount } = retryingStorage({ failures: Infinity, error });
    withRecordedDelays(waited);

    await expect(proto.executeQuery.call(storage, 'MERGE INTO t ...')).rejects.toBe(error);
    expect(attemptCount()).toBe(3);
  });

  it('doubles the backoff on each attempt', async () => {
    // Math.random is pinned: the jitter ranges of consecutive attempts overlap, so
    // comparing two live delays fails roughly 6% of the time.
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { storage, waited } = retryingStorage({ failures: 2 });
    withRecordedDelays(waited);

    await proto.executeQuery.call(storage, 'MERGE INTO t ...');

    // InitialRetryDelay 1000 x 2^(attempt-1) x (0.5 + 0.5)
    expect(waited).toEqual([1000, 2000]);
    randomSpy.mockRestore();
  });

  it('falls back to built-in retry settings when the config carries none', async () => {
    // The storage config normally inherits these from the source config; a storage built
    // without them must still retry rather than read undefined attempt counts.
    const { storage, waited, attemptCount } = retryingStorage({ failures: Infinity });
    delete storage.config.MaxFetchRetries;
    delete storage.config.InitialRetryDelay;
    withRecordedDelays(waited);

    await expect(proto.executeQuery.call(storage, 'SELECT 1')).rejects.toThrow();

    expect(attemptCount()).toBe(3);
    expect(waited.every(ms => Number.isFinite(ms) && ms > 0)).toBe(true);
  });

  it('ignores a NaN retry count instead of retrying forever', async () => {
    // Config validation accepts NaN, since typeof NaN === 'number'. Left unchecked it
    // makes the loop's exit comparison permanently false.
    const { storage, waited, attemptCount } = retryingStorage({
      failures: Infinity,
      retries: Number.NaN,
    });
    withRecordedDelays(waited);

    await expect(proto.executeQuery.call(storage, 'SELECT 1')).rejects.toThrow();

    expect(attemptCount()).toBe(3);
  });

  it('treats a retry count below one as a single attempt', async () => {
    const { storage, waited, attemptCount } = retryingStorage({ failures: Infinity, retries: 0 });
    withRecordedDelays(waited);

    await expect(proto.executeQuery.call(storage, 'SELECT 1')).rejects.toThrow();

    expect(attemptCount()).toBe(1);
    expect(waited).toEqual([]);
  });

  it('does not retry an oversized query, so the MERGE loop can halve the batch', async () => {
    // executeMergeQueryRecursively catches this and retries with a smaller batch;
    // retrying the same oversized query here would waste attempts and delay that.
    const error = apiError('invalidQuery', 400);
    error.message = 'The query is too large';
    const { storage, waited, attemptCount } = retryingStorage({ failures: Infinity, error });
    withRecordedDelays(waited);

    await expect(proto.executeQuery.call(storage, 'MERGE INTO t ...')).rejects.toBe(error);
    expect(attemptCount()).toBe(1);
    expect(waited).toEqual([]);
  });

  it('does not retry a permission failure', async () => {
    const { storage, waited, attemptCount } = retryingStorage({
      failures: Infinity,
      error: apiError('accessDenied', 403),
    });
    withRecordedDelays(waited);

    await expect(proto.executeQuery.call(storage, 'SELECT 1')).rejects.toThrow();
    expect(attemptCount()).toBe(1);
  });

  it('does not retry an exhausted quota, which no amount of waiting fixes', async () => {
    const { storage, waited, attemptCount } = retryingStorage({
      failures: Infinity,
      error: apiError('quotaExceeded', 403),
    });
    withRecordedDelays(waited);

    await expect(proto.executeQuery.call(storage, 'SELECT 1')).rejects.toThrow();
    expect(attemptCount()).toBe(1);
  });

  it('retries a rate limit, which clears on its own', async () => {
    const { storage, waited, attemptCount } = retryingStorage({
      failures: 1,
      error: apiError('rateLimitExceeded', 403),
    });
    withRecordedDelays(waited);

    await proto.executeQuery.call(storage, 'SELECT 1');

    expect(attemptCount()).toBe(2);
  });

  it('retries a dropped connection, which carries no BigQuery reason', async () => {
    const { storage, waited, attemptCount } = retryingStorage({
      failures: 1,
      error: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
    });
    withRecordedDelays(waited);

    await proto.executeQuery.call(storage, 'SELECT 1');

    expect(attemptCount()).toBe(2);
  });

  it('resubmits the statement when the job failed after BigQuery accepted it', async () => {
    // createQueryJob does not wait for the job: a MERGE that BigQuery accepts and then
    // fails while running resolves the insert and reports the failure from
    // getQueryResults. That job is DONE with an errorResult, so polling it again returns
    // the same error forever — the statement has to be sent again.
    let jobsCreated = 0;
    let resultAttempts = 0;
    const storage = Object.assign(Object.create(proto), {
      config: {
        MaxFetchRetries: configValue(3),
        InitialRetryDelay: configValue(1000),
        logMessage() {},
      },
      getBigQueryClient: () => ({
        createQueryJob: async () => {
          jobsCreated += 1;
          return [
            {
              getQueryResults: async () => {
                resultAttempts += 1;
                if (resultAttempts === 1) {
                  throw apiError('backendError');
                }
                return [[{ ok: true }]];
              },
            },
          ];
        },
      }),
    });
    const originalDelay = globalThis.AsyncUtils.delay;
    globalThis.AsyncUtils.delay = async () => {};

    try {
      const rows = await proto.executeQuery.call(storage, 'MERGE INTO t ...');

      expect(rows).toEqual([{ ok: true }]);
      expect(jobsCreated).toBe(2);
      expect(resultAttempts).toBe(2);
    } finally {
      globalThis.AsyncUtils.delay = originalDelay;
    }
  });

  it('gives up on a job that keeps failing during execution, without polling it twice', async () => {
    // Every attempt must be a fresh statement; re-polling the same dead job would burn
    // the attempts on an answer that cannot change.
    let jobsCreated = 0;
    const pollsPerJob = [];
    const storage = Object.assign(Object.create(proto), {
      config: {
        MaxFetchRetries: configValue(3),
        InitialRetryDelay: configValue(1000),
        logMessage() {},
      },
      getBigQueryClient: () => ({
        createQueryJob: async () => {
          jobsCreated += 1;
          const index = pollsPerJob.push(0) - 1;
          return [
            {
              getQueryResults: async () => {
                pollsPerJob[index] += 1;
                throw apiError('internalError');
              },
            },
          ];
        },
      }),
    });
    const originalDelay = globalThis.AsyncUtils.delay;
    globalThis.AsyncUtils.delay = async () => {};

    try {
      await expect(proto.executeQuery.call(storage, 'MERGE INTO t ...')).rejects.toThrow();

      expect(jobsCreated).toBe(3);
      expect(pollsPerJob).toEqual([1, 1, 1]);
    } finally {
      globalThis.AsyncUtils.delay = originalDelay;
    }
  });

  it('retries a job-level rate limit, which the client library never retries itself', async () => {
    // jobRateLimitExceeded arrives with a 400, so shouldRetryRequest ignores it, but
    // Google documents it as a retry-with-backoff condition.
    const { storage, waited, attemptCount } = retryingStorage({
      failures: 1,
      error: apiError('jobRateLimitExceeded', 400),
    });
    withRecordedDelays(waited);

    await proto.executeQuery.call(storage, 'MERGE INTO t ...');

    expect(attemptCount()).toBe(2);
  });

  it('caps a single backoff wait so an outage cannot park the run for an hour', async () => {
    // MaxFetchRetries has no maximum and the run holds a concurrency slot while it
    // sleeps, so the doubling needs a ceiling.
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { storage, waited } = retryingStorage({ failures: Infinity, retries: 8 });
    withRecordedDelays(waited);

    await expect(proto.executeQuery.call(storage, 'MERGE INTO t ...')).rejects.toThrow();

    expect(Math.max(...waited)).toBe(60000);
    expect(waited).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 60000]);
    randomSpy.mockRestore();
  });

  it('polls the job it already submitted when the failure carries no BigQuery reason', async () => {
    // A dropped socket says nothing about the job, which may still be running. Resubmitting
    // would run the MERGE a second time: the scan is paid for twice, and two mutations of
    // the same rows can overlap. Contrast the reasoned failures above, which must resubmit.
    let jobsCreated = 0;
    let resultAttempts = 0;
    const storage = Object.assign(Object.create(proto), {
      config: {
        MaxFetchRetries: configValue(3),
        InitialRetryDelay: configValue(1000),
        logMessage() {},
      },
      getBigQueryClient: () => ({
        createQueryJob: async () => {
          jobsCreated += 1;
          return [
            {
              getQueryResults: async () => {
                resultAttempts += 1;
                if (resultAttempts === 1) {
                  throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
                }
                return [[{ ok: true }]];
              },
            },
          ];
        },
      }),
    });
    const originalDelay = globalThis.AsyncUtils.delay;
    globalThis.AsyncUtils.delay = async () => {};

    try {
      const rows = await proto.executeQuery.call(storage, 'MERGE INTO t ...');

      expect(rows).toEqual([{ ok: true }]);
      expect(resultAttempts).toBe(2);
      expect(jobsCreated).toBe(1);
    } finally {
      globalThis.AsyncUtils.delay = originalDelay;
    }
  });

  it('submits a new job when the failure happened before one existed', async () => {
    // createQueryJob reports a job BigQuery itself rejected, so there is nothing to poll
    // and the statement has to be sent again.
    const { storage, waited, attemptCount } = retryingStorage({ failures: 1 });
    withRecordedDelays(waited);

    await proto.executeQuery.call(storage, 'MERGE INTO t ...');

    expect(attemptCount()).toBe(2);
  });

  it('makes a single attempt when retries are configured off', async () => {
    const { storage, waited, attemptCount } = retryingStorage({ failures: Infinity, retries: 1 });
    withRecordedDelays(waited);

    await expect(proto.executeQuery.call(storage, 'SELECT 1')).rejects.toThrow();
    expect(attemptCount()).toBe(1);
    expect(waited).toEqual([]);
  });
});

describe('MERGE batch chain with a transient failure', () => {
  let originalDelay;

  beforeEach(() => {
    originalDelay = globalThis.AsyncUtils.delay;
    globalThis.AsyncUtils.delay = async () => {};
  });

  afterEach(() => {
    globalThis.AsyncUtils.delay = originalDelay;
  });

  it('completes every batch when one of them fails transiently', async () => {
    // End to end over the path that failed in production: batch 2 of 3 hits a
    // backendError, and the run must still store all three batches. Driven through
    // executeMergeQueryRecursively with an explicit batch size of 1, since the buffer
    // is otherwise sent as a single query and only split when it exceeds 1MB.
    let jobs = 0;
    const storage = Object.assign(Object.create(proto), {
      totalRecordsProcessed: 0,
      config: {
        MaxFetchRetries: configValue(3),
        InitialRetryDelay: configValue(1000),
        logMessage() {},
      },
      buildMergeQuery: keys => `MERGE ${keys.join(',')}`,
      getBigQueryClient: () => ({
        createQueryJob: async () => {
          jobs += 1;
          if (jobs === 2) {
            throw Object.assign(new Error('Error encountered during execution.'), {
              code: 500,
              errors: [{ reason: 'backendError' }],
            });
          }
          return [{ getQueryResults: async () => [[]] }];
        },
      }),
    });

    await proto.executeMergeQueryRecursively.call(storage, ['a', 'b', 'c'], 1);

    // 3 batches + 1 retry of the failed one
    expect(jobs).toBe(4);
    expect(storage.totalRecordsProcessed).toBe(3);
  });

  it('leaves the buffer intact when the failure is permanent', async () => {
    // Nothing recovers the buffer on a failed run, so it must not be cleared as if
    // the records had been stored.
    const storage = Object.assign(Object.create(proto), {
      totalRecordsProcessed: 0,
      updatedRecordsBuffer: { a: {}, b: {} },
      config: {
        MaxFetchRetries: configValue(3),
        InitialRetryDelay: configValue(1000),
        logMessage() {},
      },
      buildMergeQuery: keys => `MERGE ${keys.join(',')}`,
      getBigQueryClient: () => ({
        createQueryJob: async () => {
          throw Object.assign(new Error('Access Denied'), {
            code: 403,
            errors: [{ reason: 'accessDenied' }],
          });
        },
      }),
    });

    await expect(proto.executeQueryWithSizeLimit.call(storage)).rejects.toThrow('Access Denied');
    expect(storage.updatedRecordsBuffer).toEqual({ a: {}, b: {} });
  });
});
