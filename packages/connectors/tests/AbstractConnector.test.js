// packages/connectors/tests/AbstractConnector.test.js
import assert from 'node:assert';
import { describe, it } from 'node:test';
import { AbstractConnector } from '../src/Core/AbstractConnector.js';
import { AbstractContext } from '../src/Core/AbstractContext.js';

function createTestContext(sourceConfig = {}, runConfig = {}) {
  return new AbstractContext({
    source: { name: 'TestSource', config: sourceConfig },
    storage: { name: 'TestStorage', config: {} },
    runConfig,
    env: { datamartId: 'dm-1', runId: 'run-1' },
  });
}

function createMockSource(overrides = {}) {
  return {
    fieldsSchema: {
      campaigns: {
        fields: [],
        uniqueKeys: ['id'],
        isTimeSeries: false,
        destinationName: 'campaigns',
      },
      stats: {
        fields: [],
        uniqueKeys: ['id', 'date'],
        isTimeSeries: true,
        destinationName: 'stats',
      },
    },
    parseFields: () => ({ campaigns: ['id', 'name'] }),
    getAccounts: () => [null],
    getDateStrategy: () => 'day-by-day',
    getDestinationName: (name, schema) => schema?.destinationName || name,
    fetchData: async () => [{ id: 1 }],
    onAccountComplete: () => {},
    onAccountError: () => {},
    onImportComplete: () => {},
    ...overrides,
  };
}

function createMockStorageClass() {
  const instances = [];
  const StorageClass = class MockStorage {
    constructor(context, uniqueKeys, fields, tableName) {
      this.context = context;
      this.tableName = tableName;
      this.uniqueKeys = uniqueKeys;
      this.fields = fields;
      this.savedData = [];
      this.initCalled = false;
      // Full-refresh nodes go through replaceData(), not saveData(). Recorded
      // as whole calls (not flattened) so a test can tell "the table was
      // replaced once with every account's rows" apart from "it was replaced
      // once per account".
      this.replaceCalls = [];
      instances.push(this);
    }
    async init() {
      this.initCalled = true;
    }
    async saveData(data) {
      this.savedData.push(...data);
    }
    async replaceData(data) {
      this.replaceCalls.push(data);
    }
  };
  StorageClass.instances = instances;
  return StorageClass;
}

// Unlike createMockStorageClass, this records every init()/saveData() call
// explicitly (including calls with a 0-length array), so a test can tell
// "saveData([]) was called" apart from "saveData was never called" -- the
// distinction the G4 follow-up fix depends on (AwsRedshiftStorage /
// AwsAthenaStorage create the destination table from inside an empty-batch
// saveData() call; they never get that chance if saveData is skipped for
// 0-row data).
function createSpiedStorageClass() {
  const instances = [];
  const StorageClass = class SpiedStorage {
    constructor(context, uniqueKeys, fields, tableName) {
      this.context = context;
      this.tableName = tableName;
      this.uniqueKeys = uniqueKeys;
      this.fields = fields;
      this.initCalls = 0;
      this.saveDataCalls = [];
      instances.push(this);
    }
    async init() {
      this.initCalls += 1;
    }
    async saveData(data) {
      this.saveDataCalls.push(data ? data.length : null);
    }
  };
  StorageClass.instances = instances;
  return StorageClass;
}

// Suppress stdout during tests to avoid polluting test output
function suppressStdout() {
  const original = process.stdout.write;
  process.stdout.write = () => true;
  return () => {
    process.stdout.write = original;
  };
}

// Collect the WARN-level messages a run logs. The backend translates LOG(warn)
// into `addWarningToCurrentStatus`, so this is what a customer sees on the run.
function captureWarnings(ctx) {
  const warnings = [];
  const original = ctx.log.bind(ctx);
  ctx.log = (level, message) => {
    if (level === 'warn') warnings.push(message);
    return original(level, message);
  };
  return warnings;
}

// An INCREMENTAL run's endDate is always "today", so a deterministic N-day
// window has to be anchored to now rather than to hardcoded literals. Returns
// the UTC calendar day `offset` days from today, in the same YYYY-MM-DD shape
// AbstractConnector._formatDate produces.
function utcDay(offset) {
  return new Date(Date.now() + offset * 86400000).toISOString().split('T')[0];
}

// Capture events emitted to stdout
function captureEvents() {
  const events = [];
  const original = process.stdout.write;
  process.stdout.write = data => {
    try {
      const str = data.toString().trim();
      for (const line of str.split('\n')) {
        if (line) events.push(JSON.parse(line));
      }
    } catch {}
    return true;
  };
  return {
    events,
    restore: () => {
      process.stdout.write = original;
    },
  };
}

describe('AbstractConnector', () => {
  describe('constructor', () => {
    it('throws without context', () => {
      assert.throws(() => new AbstractConnector(null, {}, class {}), /context is required/);
    });

    it('throws without source', () => {
      assert.throws(() => new AbstractConnector({}, null, class {}), /source is required/);
    });

    it('throws without StorageClass', () => {
      assert.throws(() => new AbstractConnector({}, {}, null), /StorageClass is required/);
    });
  });

  describe('run() basic flow', () => {
    it('runs catalog node and saves data to storage', async () => {
      const restore = suppressStdout();
      try {
        const ctx = createTestContext();
        const fetchCalls = [];
        const source = createMockSource({
          fetchData: async req => {
            fetchCalls.push(req);
            return [{ id: 1 }];
          },
        });
        const StorageClass = createMockStorageClass();
        const connector = new AbstractConnector(ctx, source, StorageClass);
        await connector.run();
        assert.strictEqual(fetchCalls.length, 1);
        assert.strictEqual(fetchCalls[0].nodeName, 'campaigns');
        assert.strictEqual(fetchCalls[0].accountId, null);
        assert.strictEqual(fetchCalls[0].startDate, null);
        assert.strictEqual(fetchCalls[0].endDate, null);
        assert.strictEqual(StorageClass.instances.length, 1);
        // The default mock source selects fields ['id', 'name'] for "campaigns"
        // (see createMockSource) but this fetchData only returns "id" -- so per
        // the G5 fix, "name" must be null-filled before it reaches saveData().
        assert.deepStrictEqual(StorageClass.instances[0].savedData, [{ id: 1, name: null }]);
        assert.strictEqual(StorageClass.instances[0].initCalled, true);
      } finally {
        restore();
      }
    });

    it('skips unknown nodes with warning', async () => {
      const cap = captureEvents();
      try {
        const ctx = createTestContext();
        const source = createMockSource({
          parseFields: () => ({ unknownNode: ['x'] }),
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await connector.run();
        const warnings = cap.events.filter(e => e.type === 'LOG' && e.level === 'warn');
        assert.ok(warnings.some(w => w.message.includes('Unknown node')));
      } finally {
        cap.restore();
      }
    });

    it('emits CONTROL started and completed events', async () => {
      const cap = captureEvents();
      try {
        const ctx = createTestContext();
        const connector = new AbstractConnector(ctx, createMockSource(), createMockStorageClass());
        await connector.run();
        const controls = cap.events.filter(e => e.type === 'CONTROL');
        assert.strictEqual(controls[0].action, 'started');
        assert.strictEqual(controls[controls.length - 1].action, 'completed');
      } finally {
        cap.restore();
      }
    });

    it('emits CONTROL failed on validation error', async () => {
      const cap = captureEvents();
      try {
        const ctx = createTestContext();
        const source = createMockSource();
        // Force validation error by registering a required missing param
        ctx.registerParameters({ Required: { isRequired: true, type: 'string' } });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await assert.rejects(() => connector.run(), /The parameter 'Required' is required/);
        const failed = cap.events.find(e => e.type === 'CONTROL' && e.action === 'failed');
        assert.ok(failed);
        assert.ok(failed.error);
      } finally {
        cap.restore();
      }
    });

    // A CONTROL `failed` event is translated by the backend into an
    // ERROR-severity message (connector-event.translator.ts), which is logged at
    // error level and pushed into liveErrors. The runner then reports the SAME
    // rethrown error again on stderr via RunFailureReport, which for a flagged
    // error yields a WARNING-severity message. Both land in configErrors, so the
    // run fails either way and the outcome is identical -- but the ERROR copy
    // pages someone, which is precisely what `isWarning` exists to prevent.
    // Emitting both means the warning classification never actually takes
    // effect: the alert already fired a beat earlier.
    it('does not emit an ERROR-severity CONTROL failed for a warning-classified failure', async () => {
      const cap = captureEvents();
      try {
        const ctx = createTestContext();
        // The real path: every account is skipped for a 401/403 (isWarning), so
        // _reportAccountOutcomes throws its own `isWarning = true` error -- the
        // "expired access token" case whose whole point is not to page.
        const source = createMockSource({
          getAccounts: () => ['acct-1', 'acct-2'],
          fetchData: async () => {
            throw Object.assign(new Error('403 Forbidden'), { isWarning: true });
          },
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await assert.rejects(() => connector.run(), /accounts were skipped/);

        const failed = cap.events.filter(e => e.type === 'CONTROL' && e.action === 'failed');
        assert.deepStrictEqual(
          failed,
          [],
          'a warning-classified failure must not also be announced at ERROR severity'
        );
      } finally {
        cap.restore();
      }
    });

    it('still emits CONTROL failed for an unflagged failure, and never CONTROL completed', async () => {
      const cap = captureEvents();
      try {
        const ctx = createTestContext();
        const source = createMockSource({
          fetchData: async () => {
            throw new Error('storage write exploded');
          },
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await assert.rejects(() => connector.run(), /storage write exploded/);

        const controls = cap.events.filter(e => e.type === 'CONTROL');
        assert.ok(
          controls.some(c => c.action === 'failed'),
          'an unflagged failure must still emit CONTROL failed'
        );
        assert.ok(
          !controls.some(c => c.action === 'completed'),
          'a failed run must never emit CONTROL completed'
        );
      } finally {
        cap.restore();
      }
    });

    it('a warning-classified failure still never emits CONTROL completed', async () => {
      const cap = captureEvents();
      try {
        const ctx = createTestContext();
        const source = createMockSource({
          getAccounts: () => ['acct-1'],
          fetchData: async () => {
            throw Object.assign(new Error('401 Unauthorized'), { isWarning: true });
          },
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await assert.rejects(() => connector.run(), /accounts were skipped/);

        const controls = cap.events.filter(e => e.type === 'CONTROL');
        assert.ok(
          !controls.some(c => c.action === 'completed'),
          'suppressing the ERROR-severity failed event must not turn the run into a success'
        );
      } finally {
        cap.restore();
      }
    });
  });

  describe('account iteration', () => {
    it('calls getAccounts hook for multi-account', async () => {
      const restore = suppressStdout();
      try {
        const ctx = createTestContext();
        const accountsSeen = [];
        const source = createMockSource({
          getAccounts: () => [{ id: 'acc-1' }, { id: 'acc-2' }],
          fetchData: async req => {
            accountsSeen.push(req.accountId);
            return [];
          },
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await connector.run();
        assert.deepStrictEqual(accountsSeen, ['acc-1', 'acc-2']);
      } finally {
        restore();
      }
    });

    it('calls onAccountComplete after each account', async () => {
      const restore = suppressStdout();
      try {
        const ctx = createTestContext();
        const completed = [];
        const source = createMockSource({
          getAccounts: () => [{ id: 'a' }, { id: 'b' }],
          onAccountComplete: acc => completed.push(acc?.id),
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await connector.run();
        assert.deepStrictEqual(completed, ['a', 'b']);
      } finally {
        restore();
      }
    });

    it('G3 regression: calls onAccountError, then aborts the run without attempting the remaining accounts', async () => {
      // main's contract has exactly two outcomes (FacebookMarketing
      // `_skipOrRethrow`): an account-scoped permission failure is skipped and
      // the run carries on, ANYTHING else rethrows on the spot. A storage write
      // or an exhausted transient error may well repeat on the next account, so
      // main never spent the rest of the window discovering that one account at
      // a time. onAccountError still fires as an observation hook before the
      // rethrow.
      const restore = suppressStdout();
      try {
        const ctx = createTestContext();
        const errors = [];
        const fetched = [];
        const source = createMockSource({
          getAccounts: () => [{ id: 'a' }, { id: 'b' }],
          fetchData: async req => {
            if (req.accountId === 'a') throw new Error('account A boom');
            fetched.push(req.accountId);
            return [];
          },
          onAccountError: (acc, err) => errors.push({ id: acc.id, msg: err.message }),
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await assert.rejects(() => connector.run(), /account A boom/);
        assert.strictEqual(errors.length, 1);
        assert.strictEqual(errors[0].id, 'a');
        assert.deepStrictEqual(fetched, [], 'account "b" must never be attempted');
      } finally {
        restore();
      }
    });

    // Ported from main's FacebookMarketing #1519 ("skip inaccessible ad accounts
    // instead of failing the import"). main carried it in the per-connector
    // Connector.js this branch deletes, so it lives in the shared account loop
    // here and applies to every multi-account source.
    it('skips an account-scoped permission failure and imports the remaining accounts', async () => {
      const restore = suppressStdout();
      try {
        const ctx = createTestContext();
        const fetched = [];
        const source = createMockSource({
          getAccounts: () => [{ id: 'revoked' }, { id: 'working' }],
          fetchData: async req => {
            if (req.accountId === 'revoked') {
              throw Object.assign(new Error('(#200) Ad account owner has NOT grant ads_read'), {
                isWarning: true,
              });
            }
            fetched.push(req.accountId);
            return [{ id: 7 }];
          },
        });
        const StorageClass = createMockStorageClass();
        const connector = new AbstractConnector(ctx, source, StorageClass);
        await connector.run();
        assert.deepStrictEqual(fetched, ['working']);
        // Attempting the account is not the point -- delivering its data is.
        assert.deepStrictEqual(
          StorageClass.instances[0].savedData,
          [{ id: 7, name: null }],
          'the reachable account`s rows must still land in storage'
        );
      } finally {
        restore();
      }
    });

    it('reports a partial skip as a run warning, not only in the log', async () => {
      // Without this the run status stays plain SUCCESS and a permanently
      // revoked account becomes a silent gap: green runs, missing data,
      // nothing to notice it by.
      const restore = suppressStdout();
      try {
        const ctx = createTestContext();
        const warnings = captureWarnings(ctx);
        const source = createMockSource({
          getAccounts: () => [{ id: 'revoked' }, { id: 'working' }],
          fetchData: async req => {
            if (req.accountId === 'revoked') {
              throw Object.assign(new Error('(#200) Ad account owner has NOT grant ads_read'), {
                isWarning: true,
              });
            }
            return [];
          },
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await connector.run();

        assert.ok(warnings.some(w => w.includes('Skipped account revoked')));
        assert.ok(
          warnings.some(w => w.includes('1 out of 2 accounts were skipped')),
          'the run must carry a summary warning, not just a per-account one'
        );
      } finally {
        restore();
      }
    });

    it('a non-permission error aborts a multi-account run before the next account is touched', async () => {
      // Completing this quietly would advance the incremental cursor past a
      // range whose data was never stored, and once ReimportLookbackWindow
      // passes those days are never requested again. main aborted the whole run
      // at the first such error (`_skipOrRethrow` rethrows anything not flagged
      // isWarning), so account "b" is never even requested.
      //
      // The fetch count is the real assertion here: a guard placed at the end of
      // the run instead of at the failure would still make run() reject, and
      // only the count tells the two apart.
      const restore = suppressStdout();
      try {
        const ctx = createTestContext();
        const fetched = [];
        const source = createMockSource({
          getAccounts: () => [{ id: 'a' }, { id: 'b' }],
          fetchData: async req => {
            if (req.accountId === 'a') throw new Error('BigQuery write failed');
            fetched.push(req.accountId);
            return [];
          },
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await assert.rejects(() => connector.run(), /BigQuery write failed/);
        assert.deepStrictEqual(
          fetched,
          [],
          'the run must stop at "a"; a write that failed once is likely to fail again'
        );
      } finally {
        restore();
      }
    });

    it('fails the run when every account was skipped, naming each one', async () => {
      // An expired token skips every account. Completing quietly here would
      // report a successful run that imported nothing.
      const restore = suppressStdout();
      try {
        const ctx = createTestContext();
        const source = createMockSource({
          getAccounts: () => [{ id: 'one' }, { id: 'two' }],
          fetchData: async req => {
            throw Object.assign(new Error(`token cannot reach ${req.accountId}`), {
              isWarning: true,
            });
          },
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        const error = await connector.run().then(
          () => null,
          e => e
        );

        assert.match(error.message, /All 2 accounts were skipped/);
        assert.match(error.message, /one: token cannot reach one/);
        assert.match(error.message, /two: token cannot reach two/);
        // customer-actionable: RunFailureReport keeps the message, not a stack
        assert.strictEqual(error.isWarning, true);
      } finally {
        restore();
      }
    });

    it('a single-account permission failure lands on the all-skipped path, not a raw rethrow', async () => {
      // main had no account-count special case: `_skipOrRethrow` skipped the
      // account whatever the list length, and `_throwIfAllAccountsSkipped` then
      // failed the run because every account (all one of them) was skipped. So
      // what surfaces is the all-skipped error, not the raw one -- and it stays
      // flagged isWarning, because a permission failure is customer-actionable
      // however many accounts the run had.
      const restore = suppressStdout();
      try {
        const ctx = createTestContext();
        const source = createMockSource({
          getAccounts: () => [{ id: 'act_1' }],
          fetchData: async () => {
            throw Object.assign(new Error('Token has expired'), { isWarning: true });
          },
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        const error = await connector.run().then(
          () => null,
          e => e
        );
        assert.ok(error, 'a run that imported nothing must not resolve');
        assert.match(error.message, /All 1 accounts were skipped/);
        assert.match(error.message, /act_1: Token has expired/, 'the cause must survive the wrap');
        assert.strictEqual(error.isWarning, true);
      } finally {
        restore();
      }
    });

    it('a source with no account concept takes the same all-skipped path', async () => {
      // getAccounts() => [null] means "this source has no accounts at all", the
      // AbstractSource default. It is still a one-account run as far as the
      // skip bookkeeping is concerned, so it must not fall through some other
      // branch just because the account key is synthesised from null.
      const restore = suppressStdout();
      try {
        const ctx = createTestContext();
        const source = createMockSource({
          getAccounts: () => [null],
          fetchData: async () => {
            throw Object.assign(new Error('Token has expired'), { isWarning: true });
          },
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        const error = await connector.run().then(
          () => null,
          e => e
        );
        assert.ok(error);
        assert.match(error.message, /All 1 accounts were skipped/);
        assert.match(error.message, /Token has expired/);
        assert.strictEqual(error.isWarning, true);
      } finally {
        restore();
      }
    });

    it('calls onImportComplete after all accounts', async () => {
      const restore = suppressStdout();
      try {
        const ctx = createTestContext();
        let called = false;
        const source = createMockSource({
          onImportComplete: () => {
            called = true;
          },
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await connector.run();
        assert.strictEqual(called, true);
      } finally {
        restore();
      }
    });

    it('G3 regression: onAccountError fires for time-series fetch failures too, then run() rejects (fail-fast)', async () => {
      const restore = suppressStdout();
      try {
        const ctx = createTestContext(
          {},
          {
            type: 'MANUAL_BACKFILL',
            data: [
              { configField: 'StartDate', value: '2024-01-01' },
              { configField: 'EndDate', value: '2024-01-01' },
            ],
          }
        );
        ctx.registerParameters({
          StartDate: { type: 'date', attributes: ['MANUAL_BACKFILL'] },
          EndDate: { type: 'date', attributes: ['MANUAL_BACKFILL'] },
        });
        const errors = [];
        const source = createMockSource({
          parseFields: () => ({ stats: ['id'] }),
          getAccounts: () => [{ id: 'a' }],
          getDateStrategy: () => 'day-by-day',
          fetchData: async () => {
            throw new Error('time-series boom');
          },
          onAccountError: (acc, err) => errors.push({ id: acc.id, msg: err.message }),
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await assert.rejects(() => connector.run(), /time-series boom/);
        assert.strictEqual(errors.length, 1);
        assert.strictEqual(errors[0].id, 'a');
        assert.match(errors[0].msg, /time-series boom/);
      } finally {
        restore();
      }
    });

    it('G3 regression: an account error emits CONTROL failed and never emits completed', async () => {
      const cap = captureEvents();
      try {
        const ctx = createTestContext();
        const source = createMockSource({
          getAccounts: () => [{ id: 'good' }, { id: 'bad' }],
          fetchData: async req => {
            if (req.accountId === 'bad') throw new Error('account bad boom');
            return [{ id: 1 }];
          },
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await assert.rejects(() => connector.run(), /account bad boom/);
        const controls = cap.events.filter(e => e.type === 'CONTROL');
        assert.strictEqual(controls[0].action, 'started');
        const failed = controls.find(e => e.action === 'failed');
        assert.ok(failed, 'expected a CONTROL failed event');
        assert.match(failed.error, /account bad boom/);
        assert.ok(
          !controls.some(e => e.action === 'completed'),
          'a failed run must never also emit CONTROL completed'
        );
      } finally {
        cap.restore();
      }
    });
  });

  describe('time-series strategies', () => {
    it('range strategy makes single fetch with full date range', async () => {
      const cap = captureEvents();
      try {
        const ctx = createTestContext({
          Fields: { value: 'stats.id' },
          LastRequestedDate: { value: '2024-01-01' },
          ReimportLookbackWindow: { value: '0' },
        });
        const fetchCalls = [];
        const source = createMockSource({
          parseFields: () => ({ stats: ['id', 'date'] }),
          getDateStrategy: () => 'range',
          fetchData: async req => {
            fetchCalls.push(req);
            return [];
          },
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await connector.run();
        assert.strictEqual(fetchCalls.length, 1);
        assert.strictEqual(fetchCalls[0].startDate, '2024-01-01');
        assert.ok(fetchCalls[0].endDate);
      } finally {
        cap.restore();
      }
    });

    it('day-by-day strategy iterates each date', async () => {
      const cap = captureEvents();
      try {
        // Use MANUAL_BACKFILL to control date range deterministically
        const ctx = createTestContext(
          {},
          {
            type: 'MANUAL_BACKFILL',
            data: [
              { configField: 'StartDate', value: '2024-01-01' },
              { configField: 'EndDate', value: '2024-01-03' },
            ],
          }
        );
        ctx.registerParameters({
          StartDate: { type: 'date', attributes: ['MANUAL_BACKFILL'] },
          EndDate: { type: 'date', attributes: ['MANUAL_BACKFILL'] },
        });
        const dates = [];
        const source = createMockSource({
          parseFields: () => ({ stats: ['id', 'date'] }),
          getDateStrategy: () => 'day-by-day',
          fetchData: async req => {
            dates.push(req.startDate);
            return [];
          },
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await connector.run();
        assert.deepStrictEqual(dates, ['2024-01-01', '2024-01-02', '2024-01-03']);
      } finally {
        cap.restore();
      }
    });

    it('emits StateEvent with lastRequestedDate after each fetch (INCREMENTAL)', async () => {
      const cap = captureEvents();
      try {
        // Use relative dates (yesterday -> today) instead of hardcoded literals:
        // INCREMENTAL's endDate is always "today" (real current date), so the
        // date range must be anchored to "now" to stay a deterministic 2-day
        // window regardless of when this test runs.
        const today = new Date();
        const yesterday = new Date(today.getTime() - 86400000);
        const todayStr = today.toISOString().split('T')[0];
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        const ctx = createTestContext({
          LastRequestedDate: { value: yesterdayStr },
          ReimportLookbackWindow: { value: '0' },
        }); // default runConfig -> INCREMENTAL (AbstractContext defaults type to INCREMENTAL)
        const source = createMockSource({
          parseFields: () => ({ stats: ['id', 'date'] }),
          getDateStrategy: () => 'day-by-day',
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await connector.run();
        const states = cap.events.filter(e => e.type === 'STATE');
        assert.strictEqual(states.length, 2);
        assert.strictEqual(states[0].state.lastRequestedDate, yesterdayStr);
        assert.strictEqual(states[1].state.lastRequestedDate, todayStr);
      } finally {
        cap.restore();
      }
    });

    it('G3 regression: does NOT emit StateEvent for MANUAL_BACKFILL runs (state gated to INCREMENTAL only)', async () => {
      // main never persisted LastRequestedDate for manual backfills (see
      // main's AbstractConnector.startImportProcess(): "Only update
      // LastRequestedDate for incremental runs"). The redesigned engine
      // regressed this by emitting StateEvent unconditionally on every
      // fetch, which would let a MANUAL_BACKFILL run clobber the live
      // incremental checkpoint. Assert zero STATE events for both the
      // day-by-day AND range date strategies under MANUAL_BACKFILL.
      const cap = captureEvents();
      try {
        const ctx = createTestContext(
          {},
          {
            type: 'MANUAL_BACKFILL',
            data: [
              { configField: 'StartDate', value: '2024-01-01' },
              { configField: 'EndDate', value: '2024-01-02' },
            ],
          }
        );
        ctx.registerParameters({
          StartDate: { type: 'date', attributes: ['MANUAL_BACKFILL'] },
          EndDate: { type: 'date', attributes: ['MANUAL_BACKFILL'] },
        });
        const source = createMockSource({
          parseFields: () => ({ stats: ['id', 'date'] }),
          getDateStrategy: () => 'day-by-day',
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await connector.run();
        const states = cap.events.filter(e => e.type === 'STATE');
        assert.strictEqual(states.length, 0, 'MANUAL_BACKFILL must not emit any STATE event');
      } finally {
        cap.restore();
      }
    });

    it('G3 regression: does NOT emit StateEvent for MANUAL_BACKFILL runs (range strategy)', async () => {
      const cap = captureEvents();
      try {
        const ctx = createTestContext(
          {},
          {
            type: 'MANUAL_BACKFILL',
            data: [
              { configField: 'StartDate', value: '2024-01-01' },
              { configField: 'EndDate', value: '2024-01-02' },
            ],
          }
        );
        ctx.registerParameters({
          StartDate: { type: 'date', attributes: ['MANUAL_BACKFILL'] },
          EndDate: { type: 'date', attributes: ['MANUAL_BACKFILL'] },
        });
        const source = createMockSource({
          parseFields: () => ({ stats: ['id', 'date'] }),
          getDateStrategy: () => 'range',
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await connector.run();
        const states = cap.events.filter(e => e.type === 'STATE');
        assert.strictEqual(states.length, 0, 'MANUAL_BACKFILL must not emit any STATE event');
      } finally {
        cap.restore();
      }
    });
  });

  describe('storage per node', () => {
    it('wires the resolved destination name into the DestinationTableName parameter', () => {
      const ctx = createTestContext();
      const connector = new AbstractConnector(ctx, createMockSource(), createMockStorageClass());
      connector.getStorageForNode('campaigns', {
        destinationName: 'campaigns_t',
        uniqueKeys: ['id'],
        fields: [],
      });
      // The storage layer reads the table from DestinationTableName (default "Data");
      // getStorageForNode must wire the resolved per-node name into it.
      assert.strictEqual(ctx.getParameter('DestinationTableName')?.value, 'campaigns_t');
    });

    it('creates separate storage instance per node', async () => {
      const restore = suppressStdout();
      try {
        const ctx = createTestContext();
        const source = createMockSource({
          parseFields: () => ({ campaigns: ['id'], stats: ['id'] }),
          fieldsSchema: {
            campaigns: {
              fields: [],
              uniqueKeys: ['id'],
              isTimeSeries: false,
              destinationName: 'campaigns_t',
            },
            stats: {
              fields: [],
              uniqueKeys: ['id', 'date'],
              isTimeSeries: false,
              destinationName: 'stats_t',
            },
          },
        });
        const StorageClass = createMockStorageClass();
        const connector = new AbstractConnector(ctx, source, StorageClass);
        await connector.run();
        assert.strictEqual(StorageClass.instances.length, 2);
        const tableNames = StorageClass.instances.map(s => s.tableName).sort();
        assert.deepStrictEqual(tableNames, ['campaigns_t', 'stats_t']);
      } finally {
        restore();
      }
    });

    it('skips storage save on empty data', async () => {
      const restore = suppressStdout();
      try {
        const ctx = createTestContext();
        const source = createMockSource({
          fetchData: async () => [],
        });
        const StorageClass = createMockStorageClass();
        const connector = new AbstractConnector(ctx, source, StorageClass);
        await connector.run();
        assert.strictEqual(StorageClass.instances[0].savedData.length, 0);
      } finally {
        restore();
      }
    });

    it('G3 regression: propagates storage.init() errors to onAccountError, then run() rejects (fail-fast)', async () => {
      const restore = suppressStdout();
      try {
        const ctx = createTestContext();
        const errors = [];
        const source = createMockSource({
          onAccountError: (_acc, err) => errors.push(err.message),
        });
        const FailingStorage = class FailingStorage {
          constructor() {}
          async init() {
            throw new Error('connection refused');
          }
          async saveData() {}
        };
        const connector = new AbstractConnector(ctx, source, FailingStorage);
        await assert.rejects(() => connector.run(), /connection refused/);
        assert.strictEqual(errors.length, 1);
        assert.match(errors[0], /connection refused/);
      } finally {
        restore();
      }
    });
  });

  describe('G6 regression: manual-backfill date guards', () => {
    it('throws when StartDate is missing (was: silently skip the node, run COMPLETED with 0 rows)', () => {
      const ctx = createTestContext(
        {},
        {
          type: 'MANUAL_BACKFILL',
          data: [{ configField: 'EndDate', value: '2024-01-05' }],
        }
      );
      const connector = new AbstractConnector(ctx, createMockSource(), createMockStorageClass());
      assert.throws(
        () => connector._getManualBackfillDateRange(),
        /StartDate is required for manual backfill/
      );
    });

    it('throws when EndDate < StartDate (was: silently 0 iterations)', () => {
      const ctx = createTestContext(
        {},
        {
          type: 'MANUAL_BACKFILL',
          data: [
            { configField: 'StartDate', value: '2024-01-10' },
            { configField: 'EndDate', value: '2024-01-05' },
          ],
        }
      );
      const connector = new AbstractConnector(ctx, createMockSource(), createMockStorageClass());
      assert.throws(
        () => connector._getManualBackfillDateRange(),
        /EndDate.*cannot be earlier than StartDate/
      );
    });

    it('throws when StartDate is in the future', () => {
      // EndDate is set to the same far-future date (not omitted) so the
      // earlier "EndDate < StartDate" check doesn't fire first -- this
      // isolates the "StartDate in the future" branch (matches main's check
      // ordering: EndDate-vs-StartDate is validated before StartDate-vs-today).
      const farFuture = new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0];
      const ctx = createTestContext(
        {},
        {
          type: 'MANUAL_BACKFILL',
          data: [
            { configField: 'StartDate', value: farFuture },
            { configField: 'EndDate', value: farFuture },
          ],
        }
      );
      const connector = new AbstractConnector(ctx, createMockSource(), createMockStorageClass());
      assert.throws(
        () => connector._getManualBackfillDateRange(),
        /StartDate.*cannot be in the future/
      );
    });

    // The clamp is the DESIGNED handling of a future EndDate -- POST
    // /data-marts/:id/run deliberately accepts one precisely because the engine
    // clamps it -- so it must be logged at INFO. At WARN the backend translates
    // it into ConnectorMessageType.WARNING, pushes it into configErrors and
    // demotes the config to FAILED, turning a complete backfill into a failure.
    it('clips EndDate to today (logging INFO, not a run-failing WARN) when EndDate is in the future', () => {
      const cap = captureEvents();
      try {
        const today = new Date().toISOString().split('T')[0];
        const farFuture = new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0];
        const ctx = createTestContext(
          {},
          {
            type: 'MANUAL_BACKFILL',
            data: [
              { configField: 'StartDate', value: '2024-01-01' },
              { configField: 'EndDate', value: farFuture },
            ],
          }
        );
        const connector = new AbstractConnector(ctx, createMockSource(), createMockStorageClass());
        const range = connector._getManualBackfillDateRange();
        assert.strictEqual(range.startDate, '2024-01-01');
        assert.strictEqual(range.endDate, today);
        const clampLogs = cap.events.filter(
          e =>
            e.type === 'LOG' && typeof e.message === 'string' && e.message.includes('in the future')
        );
        assert.strictEqual(clampLogs.length, 1, 'expected exactly one clamp log');
        assert.strictEqual(clampLogs[0].level, 'info');
        assert.deepStrictEqual(
          cap.events.filter(e => e.type === 'LOG' && e.level === 'warn'),
          [],
          'clamping a future EndDate must not emit a WARN -- the backend would fail the run'
        );
      } finally {
        cap.restore();
      }
    });

    it('defaults EndDate to today when omitted, and does not throw', () => {
      const today = new Date().toISOString().split('T')[0];
      const ctx = createTestContext(
        {},
        {
          type: 'MANUAL_BACKFILL',
          data: [{ configField: 'StartDate', value: '2024-01-01' }],
        }
      );
      const connector = new AbstractConnector(ctx, createMockSource(), createMockStorageClass());
      const range = connector._getManualBackfillDateRange();
      assert.strictEqual(range.startDate, '2024-01-01');
      assert.strictEqual(range.endDate, today);
    });
  });

  describe('_iterateDates DST safety', () => {
    it('does not duplicate or skip dates across DST spring-forward', () => {
      const ctx = createTestContext();
      const connector = new AbstractConnector(ctx, createMockSource(), createMockStorageClass());
      const dates = [];
      for (const d of connector._iterateDates('2024-03-09', '2024-03-12')) {
        dates.push(d.toISOString().split('T')[0]);
      }
      assert.deepStrictEqual(dates, ['2024-03-09', '2024-03-10', '2024-03-11', '2024-03-12']);
    });

    it('does not duplicate or skip dates across DST fall-back', () => {
      const ctx = createTestContext();
      const connector = new AbstractConnector(ctx, createMockSource(), createMockStorageClass());
      const dates = [];
      for (const d of connector._iterateDates('2024-11-02', '2024-11-04')) {
        dates.push(d.toISOString().split('T')[0]);
      }
      assert.deepStrictEqual(dates, ['2024-11-02', '2024-11-03', '2024-11-04']);
    });

    it('handles single-day range', () => {
      const ctx = createTestContext();
      const connector = new AbstractConnector(ctx, createMockSource(), createMockStorageClass());
      const dates = [];
      for (const d of connector._iterateDates('2024-06-15', '2024-06-15')) {
        dates.push(d.toISOString().split('T')[0]);
      }
      assert.deepStrictEqual(dates, ['2024-06-15']);
    });

    it('_applyLookbackWindow does not drift due to local timezone', () => {
      const ctx = createTestContext();
      ctx.registerParameters({ ReimportLookbackWindow: { type: 'number', default: 5 } });
      const connector = new AbstractConnector(ctx, createMockSource(), createMockStorageClass());
      const result = connector._applyLookbackWindow('2024-03-15');
      assert.strictEqual(result, '2024-03-10');
    });
  });

  describe('Source contract validation', () => {
    it('throws clear error when source.fieldsSchema is missing', async () => {
      const cap = captureEvents();
      try {
        const ctx = createTestContext();
        const source = createMockSource();
        delete source.fieldsSchema;
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await assert.rejects(() => connector.run(), /must declare fieldsSchema/);
      } finally {
        cap.restore();
      }
    });

    it('handles getAccounts returning null gracefully', async () => {
      const restore = suppressStdout();
      try {
        const ctx = createTestContext();
        const source = createMockSource({ getAccounts: () => null });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await connector.run(); // should not throw
      } finally {
        restore();
      }
    });

    it('handles getAccounts returning undefined gracefully', async () => {
      const restore = suppressStdout();
      try {
        const ctx = createTestContext();
        const source = createMockSource({ getAccounts: () => undefined });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await connector.run(); // should not throw
      } finally {
        restore();
      }
    });
  });

  describe('G4 follow-up: saveData is called within the CreateEmptyTables gate', () => {
    // AwsRedshiftStorage / AwsAthenaStorage defer table creation into
    // saveData() itself (see their internal empty-batch branches). storage
    // init() alone does NOT create the table for them. So when
    // CreateEmptyTables=true and a node fetches 0 rows, the engine must still
    // call saveData([]) -- not just init() -- or those two storages silently
    // never materialize the empty table. These tests use a storage double
    // that records every init()/saveData() call (including 0-length calls)
    // to prove the exact call shape, independent of any specific storage's
    // internals.

    it('catalog node, 0 rows, CreateEmptyTables=true: calls BOTH init() and saveData([])', async () => {
      const restore = suppressStdout();
      try {
        const ctx = createTestContext({ CreateEmptyTables: { value: true } });
        const source = createMockSource({ fetchData: async () => [] });
        const StorageClass = createSpiedStorageClass();
        const connector = new AbstractConnector(ctx, source, StorageClass);
        await connector.run();
        const storage = StorageClass.instances[0];
        assert.strictEqual(storage.initCalls, 1, 'init() must be called');
        assert.deepStrictEqual(
          storage.saveDataCalls,
          [0],
          'saveData() must be called once with a 0-length array'
        );
      } finally {
        restore();
      }
    });

    it('catalog node, 0 rows, CreateEmptyTables=false: calls NEITHER init() nor saveData()', async () => {
      const restore = suppressStdout();
      try {
        const ctx = createTestContext();
        const source = createMockSource({ fetchData: async () => [] });
        const StorageClass = createSpiedStorageClass();
        const connector = new AbstractConnector(ctx, source, StorageClass);
        await connector.run();
        const storage = StorageClass.instances[0];
        assert.strictEqual(storage.initCalls, 0, 'init() must not be called');
        assert.deepStrictEqual(storage.saveDataCalls, [], 'saveData() must not be called');
      } finally {
        restore();
      }
    });

    it('time-series day-by-day, 0 rows every day, CreateEmptyTables=true: calls init() and saveData([]) each day', async () => {
      const restore = suppressStdout();
      try {
        const ctx = createTestContext(
          { CreateEmptyTables: { value: true } },
          {
            type: 'MANUAL_BACKFILL',
            data: [
              { configField: 'StartDate', value: '2024-01-01' },
              { configField: 'EndDate', value: '2024-01-02' },
            ],
          }
        );
        ctx.registerParameters({
          StartDate: { type: 'date', attributes: ['MANUAL_BACKFILL'] },
          EndDate: { type: 'date', attributes: ['MANUAL_BACKFILL'] },
        });
        const source = createMockSource({
          parseFields: () => ({ stats: ['id', 'date'] }),
          getDateStrategy: () => 'day-by-day',
          fetchData: async () => [],
        });
        const StorageClass = createSpiedStorageClass();
        const connector = new AbstractConnector(ctx, source, StorageClass);
        await connector.run();
        const storage = StorageClass.instances[0];
        // init() is memoized (ensureStorageInit) -- only fires once even
        // though the gate is true on both days.
        assert.strictEqual(storage.initCalls, 1, 'init() must be called exactly once');
        assert.deepStrictEqual(
          storage.saveDataCalls,
          [0, 0],
          'saveData([]) must be called once per day while the gate is true (matches main)'
        );
      } finally {
        restore();
      }
    });

    it('time-series day-by-day, 0 rows every day, CreateEmptyTables=false: calls NEITHER init() nor saveData()', async () => {
      const restore = suppressStdout();
      try {
        const ctx = createTestContext(
          {},
          {
            type: 'MANUAL_BACKFILL',
            data: [
              { configField: 'StartDate', value: '2024-01-01' },
              { configField: 'EndDate', value: '2024-01-02' },
            ],
          }
        );
        ctx.registerParameters({
          StartDate: { type: 'date', attributes: ['MANUAL_BACKFILL'] },
          EndDate: { type: 'date', attributes: ['MANUAL_BACKFILL'] },
        });
        const source = createMockSource({
          parseFields: () => ({ stats: ['id', 'date'] }),
          getDateStrategy: () => 'day-by-day',
          fetchData: async () => [],
        });
        const StorageClass = createSpiedStorageClass();
        const connector = new AbstractConnector(ctx, source, StorageClass);
        await connector.run();
        const storage = StorageClass.instances[0];
        assert.strictEqual(storage.initCalls, 0, 'init() must not be called');
        assert.deepStrictEqual(storage.saveDataCalls, [], 'saveData() must not be called');
      } finally {
        restore();
      }
    });

    it('time-series range, 0 rows, CreateEmptyTables=true: calls BOTH init() and saveData([])', async () => {
      const restore = suppressStdout();
      try {
        const ctx = createTestContext({
          CreateEmptyTables: { value: true },
          LastRequestedDate: { value: '2024-01-01' },
          ReimportLookbackWindow: { value: '0' },
        });
        const source = createMockSource({
          parseFields: () => ({ stats: ['id', 'date'] }),
          getDateStrategy: () => 'range',
          fetchData: async () => [],
        });
        const StorageClass = createSpiedStorageClass();
        const connector = new AbstractConnector(ctx, source, StorageClass);
        await connector.run();
        const storage = StorageClass.instances[0];
        assert.strictEqual(storage.initCalls, 1, 'init() must be called');
        assert.deepStrictEqual(
          storage.saveDataCalls,
          [0],
          'saveData() must be called once with a 0-length array'
        );
      } finally {
        restore();
      }
    });

    it('time-series range, 0 rows, CreateEmptyTables=false: calls NEITHER init() nor saveData()', async () => {
      const restore = suppressStdout();
      try {
        const ctx = createTestContext({
          LastRequestedDate: { value: '2024-01-01' },
          ReimportLookbackWindow: { value: '0' },
        });
        const source = createMockSource({
          parseFields: () => ({ stats: ['id', 'date'] }),
          getDateStrategy: () => 'range',
          fetchData: async () => [],
        });
        const StorageClass = createSpiedStorageClass();
        const connector = new AbstractConnector(ctx, source, StorageClass);
        await connector.run();
        const storage = StorageClass.instances[0];
        assert.strictEqual(storage.initCalls, 0, 'init() must not be called');
        assert.deepStrictEqual(storage.saveDataCalls, [], 'saveData() must not be called');
      } finally {
        restore();
      }
    });

    it('rows present: saveData() is still called with the actual data (unaffected by the gate change)', async () => {
      const restore = suppressStdout();
      try {
        const ctx = createTestContext();
        const source = createMockSource({ fetchData: async () => [{ id: 1 }, { id: 2 }] });
        const StorageClass = createSpiedStorageClass();
        const connector = new AbstractConnector(ctx, source, StorageClass);
        await connector.run();
        const storage = StorageClass.instances[0];
        assert.strictEqual(storage.initCalls, 1);
        assert.deepStrictEqual(storage.saveDataCalls, [2]);
      } finally {
        restore();
      }
    });
  });

  describe('G5 regression: addMissingFieldsToData (omitted API field -> null, not absent)', () => {
    // main null-filled any selected field a fetched record omitted, right before
    // storage.saveData() (AbstractConnector.addMissingFieldsToData, called from
    // every bundled connector with `this.addMissingFieldsToData(data, fields)`).
    // The redesigned engine dropped this step entirely, so a record the API
    // returns without one of the selected fields now reaches saveData() missing
    // that key outright instead of carrying it as null. Several bundled
    // connectors' row-mapping helpers key off `if (field in record)`
    // (LinkedInAds, MicrosoftAds Helper.filterByFields, TikTokAds castFields) --
    // for them a vanished key means the column silently disappears instead of
    // becoming NULL. Assert saveData() always receives every selected field as
    // an explicit key (null when the source omitted it), for both catalog and
    // time-series (day-by-day + range) node paths.

    it('catalog node: a record missing a selected field reaches saveData() with that field null (not absent)', async () => {
      const restore = suppressStdout();
      try {
        const ctx = createTestContext();
        const source = createMockSource({
          parseFields: () => ({ campaigns: ['id', 'name'] }),
          // API omits "name" entirely for this record.
          fetchData: async () => [{ id: 1 }],
        });
        const StorageClass = createMockStorageClass();
        const connector = new AbstractConnector(ctx, source, StorageClass);
        await connector.run();
        const [record] = StorageClass.instances[0].savedData;
        assert.ok('name' in record, '"name" must be present as a key');
        assert.strictEqual(record.name, null);
        assert.strictEqual(record.id, 1);
      } finally {
        restore();
      }
    });

    it('time-series day-by-day node: a record missing a selected field reaches saveData() with that field null', async () => {
      const restore = suppressStdout();
      try {
        const ctx = createTestContext(
          {},
          {
            type: 'MANUAL_BACKFILL',
            data: [
              { configField: 'StartDate', value: '2024-01-01' },
              { configField: 'EndDate', value: '2024-01-01' },
            ],
          }
        );
        ctx.registerParameters({
          StartDate: { type: 'date', attributes: ['MANUAL_BACKFILL'] },
          EndDate: { type: 'date', attributes: ['MANUAL_BACKFILL'] },
        });
        const source = createMockSource({
          parseFields: () => ({ stats: ['id', 'date', 'clicks'] }),
          getDateStrategy: () => 'day-by-day',
          // API omits "clicks" entirely for this record.
          fetchData: async () => [{ id: 1, date: '2024-01-01' }],
        });
        const StorageClass = createMockStorageClass();
        const connector = new AbstractConnector(ctx, source, StorageClass);
        await connector.run();
        const [record] = StorageClass.instances[0].savedData;
        assert.ok('clicks' in record, '"clicks" must be present as a key');
        assert.strictEqual(record.clicks, null);
      } finally {
        restore();
      }
    });

    it('time-series range node: a record missing a selected field reaches saveData() with that field null', async () => {
      const restore = suppressStdout();
      try {
        const ctx = createTestContext({
          LastRequestedDate: { value: '2024-01-01' },
          ReimportLookbackWindow: { value: '0' },
        });
        const source = createMockSource({
          parseFields: () => ({ stats: ['id', 'date', 'clicks'] }),
          getDateStrategy: () => 'range',
          // API omits "clicks" entirely for this record.
          fetchData: async () => [{ id: 1, date: '2024-01-01' }],
        });
        const StorageClass = createMockStorageClass();
        const connector = new AbstractConnector(ctx, source, StorageClass);
        await connector.run();
        const [record] = StorageClass.instances[0].savedData;
        assert.ok('clicks' in record, '"clicks" must be present as a key');
        assert.strictEqual(record.clicks, null);
      } finally {
        restore();
      }
    });

    it('does not mutate the record for fields that already exist (including falsy values)', async () => {
      const restore = suppressStdout();
      try {
        const ctx = createTestContext();
        const source = createMockSource({
          parseFields: () => ({ campaigns: ['id', 'name', 'clicks'] }),
          fetchData: async () => [{ id: 1, name: '', clicks: 0 }],
        });
        const StorageClass = createMockStorageClass();
        const connector = new AbstractConnector(ctx, source, StorageClass);
        await connector.run();
        const [record] = StorageClass.instances[0].savedData;
        assert.strictEqual(
          record.name,
          '',
          'existing falsy string must be preserved, not overwritten'
        );
        assert.strictEqual(
          record.clicks,
          0,
          'existing falsy number must be preserved, not overwritten'
        );
      } finally {
        restore();
      }
    });
  });

  describe('D1 regression: an ISO-8601 backfill date imported nothing, quietly', () => {
    // A MANUAL_BACKFILL StartDate/EndDate reaches the engine verbatim from
    // POST /data-marts/:id/run -- that endpoint's DTO only validates that
    // `runConfig.data` is an object, so an ISO-8601 timestamp
    // ('2024-01-15T00:00:00.000Z', what any Date.toISOString()/date-picker
    // client sends) arrives routinely. AbstractContext cannot catch it either:
    // validate() runs BEFORE _processRunConfig() applies the override, and
    // _validateRunConfig() only checks configField/attributes, never the
    // value's shape.
    //
    // The old _parseDate was `dateStr.split('-').map(Number)`, which read that
    // as [2024, 1, NaN] -> Date.UTC(...) -> NaN. Every guard in
    // _getManualBackfillDateRange compares against NaN and is therefore false,
    // so nothing was rejected, and _iterateDates ran
    // `for (let t = NaN; t <= NaN; ...)` -> zero iterations. The run emitted
    // CONTROL(completed) having fetched nothing. main did not have this hole:
    // _processRunConfig coerced the value with `new Date(value)` whenever
    // `requiredType === 'date'` (see main's AbstractConnector._processRunConfig).

    it('day-by-day backfill with ISO-8601 bounds imports every requested day and writes the rows', async () => {
      const restore = suppressStdout();
      try {
        const ctx = createTestContext(
          {},
          {
            type: 'MANUAL_BACKFILL',
            data: [
              { configField: 'StartDate', value: '2024-01-15T00:00:00.000Z' },
              { configField: 'EndDate', value: '2024-01-17T00:00:00.000Z' },
            ],
          }
        );
        ctx.registerParameters({
          StartDate: { type: 'date', attributes: ['MANUAL_BACKFILL'] },
          EndDate: { type: 'date', attributes: ['MANUAL_BACKFILL'] },
        });
        const dates = [];
        const source = createMockSource({
          parseFields: () => ({ stats: ['id', 'date'] }),
          getDateStrategy: () => 'day-by-day',
          fetchData: async req => {
            dates.push(req.startDate);
            return [{ id: 1, date: req.startDate }];
          },
        });
        const StorageClass = createMockStorageClass();
        const connector = new AbstractConnector(ctx, source, StorageClass);
        await connector.run();
        assert.deepStrictEqual(dates, ['2024-01-15', '2024-01-16', '2024-01-17']);
        // Asserting the fetch calls alone would not prove the run delivered
        // anything: the bug's symptom is a green run with an empty table.
        assert.strictEqual(
          StorageClass.instances[0].savedData.length,
          3,
          'every requested day must actually reach storage'
        );
      } finally {
        restore();
      }
    });

    it('range strategy receives a normalized YYYY-MM-DD range, never the raw ISO input', async () => {
      // The RANGE strategy hands startDate/endDate straight to
      // source.fetchData(), and DeclarativeSource._withDateWindow injects them
      // into the upstream request (query params or request body) unchanged. An
      // accepted ISO-8601 input must therefore be normalized before it leaves
      // the engine, or the API sees a timestamp where it expects a date.
      const restore = suppressStdout();
      try {
        const ctx = createTestContext(
          {},
          {
            type: 'MANUAL_BACKFILL',
            data: [
              { configField: 'StartDate', value: '2024-01-15T00:00:00.000Z' },
              { configField: 'EndDate', value: '2024-01-17T08:30:00.000Z' },
            ],
          }
        );
        ctx.registerParameters({
          StartDate: { type: 'date', attributes: ['MANUAL_BACKFILL'] },
          EndDate: { type: 'date', attributes: ['MANUAL_BACKFILL'] },
        });
        const fetchCalls = [];
        const source = createMockSource({
          parseFields: () => ({ stats: ['id', 'date'] }),
          getDateStrategy: () => 'range',
          fetchData: async req => {
            fetchCalls.push(req);
            return [{ id: 1 }];
          },
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await connector.run();
        assert.strictEqual(fetchCalls.length, 1);
        assert.strictEqual(fetchCalls[0].startDate, '2024-01-15');
        assert.strictEqual(fetchCalls[0].endDate, '2024-01-17');
      } finally {
        restore();
      }
    });

    it('throws naming the field and the offending value when a backfill date cannot be parsed', () => {
      const ctx = createTestContext(
        {},
        {
          type: 'MANUAL_BACKFILL',
          data: [
            { configField: 'StartDate', value: '15/01/2024' },
            { configField: 'EndDate', value: '2024-01-17' },
          ],
        }
      );
      const connector = new AbstractConnector(ctx, createMockSource(), createMockStorageClass());
      let error = null;
      try {
        connector._getManualBackfillDateRange();
      } catch (e) {
        error = e;
      }
      assert.ok(error, 'an unreadable date must fail loudly, never degrade to "no work to do"');
      assert.match(error.message, /StartDate/, 'the message must name the field');
      assert.match(error.message, /15\/01\/2024/, 'the message must quote the offending value');
      // `isWarning` is overloaded: _skipOrFail reads it as "an account-scoped
      // 401/403, safe to skip". This error is raised INSIDE the account loop
      // (getDateRange() runs per node per account), so flagging it would make a
      // bad date quietly skip accounts instead of failing the run -- the exact
      // silent-data-loss shape this fix exists to remove.
      assert.notStrictEqual(error.isWarning, true, 'a config error must not look like a 401/403');
    });

    it('an unparseable backfill date emits CONTROL failed, never CONTROL completed, and fetches nothing', async () => {
      const cap = captureEvents();
      try {
        const ctx = createTestContext(
          {},
          {
            type: 'MANUAL_BACKFILL',
            data: [
              { configField: 'StartDate', value: 'not-a-date' },
              { configField: 'EndDate', value: '2024-01-17' },
            ],
          }
        );
        ctx.registerParameters({
          StartDate: { type: 'date', attributes: ['MANUAL_BACKFILL'] },
          EndDate: { type: 'date', attributes: ['MANUAL_BACKFILL'] },
        });
        const fetchCalls = [];
        const source = createMockSource({
          parseFields: () => ({ stats: ['id', 'date'] }),
          getDateStrategy: () => 'day-by-day',
          fetchData: async req => {
            fetchCalls.push(req);
            return [];
          },
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await assert.rejects(() => connector.run(), /not-a-date/);
        const controls = cap.events.filter(e => e.type === 'CONTROL');
        assert.ok(
          controls.find(e => e.action === 'failed'),
          'expected a CONTROL failed event'
        );
        assert.ok(
          !controls.some(e => e.action === 'completed'),
          'a run that wrote no part of the requested window must never report completed'
        );
        assert.deepStrictEqual(fetchCalls, [], 'nothing may be fetched with an unreadable window');
      } finally {
        cap.restore();
      }
    });

    it('a bad date fails a MULTI-account run too (it must not be skipped as a permission error)', async () => {
      // Guards the isWarning reasoning above end to end: an account failure is
      // only skipped when error.isWarning === true, so a wrongly-flagged config
      // error would silently skip every account here and land on the
      // partial/total-skip path instead of failing on the real cause.
      const restore = suppressStdout();
      try {
        const ctx = createTestContext(
          {},
          {
            type: 'MANUAL_BACKFILL',
            data: [
              { configField: 'StartDate', value: '15/01/2024' },
              { configField: 'EndDate', value: '2024-01-17' },
            ],
          }
        );
        ctx.registerParameters({
          StartDate: { type: 'date', attributes: ['MANUAL_BACKFILL'] },
          EndDate: { type: 'date', attributes: ['MANUAL_BACKFILL'] },
        });
        const source = createMockSource({
          parseFields: () => ({ stats: ['id', 'date'] }),
          getDateStrategy: () => 'day-by-day',
          getAccounts: () => [{ id: 'acc-1' }, { id: 'acc-2' }],
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await assert.rejects(() => connector.run(), /StartDate/);
      } finally {
        restore();
      }
    });

    it('_parseDate accepts YYYY-MM-DD, ISO-8601, offset ISO, Date, epoch and unpadded components', () => {
      const connector = new AbstractConnector(
        createTestContext(),
        createMockSource(),
        createMockStorageClass()
      );
      assert.strictEqual(connector._parseDate('2024-01-15'), Date.UTC(2024, 0, 15));
      assert.strictEqual(connector._parseDate('2024-01-15T00:00:00.000Z'), Date.UTC(2024, 0, 15));
      // The calendar date is taken literally from the YYYY-MM-DD prefix.
      // Shifting this instant into UTC would land on the 16th -- not the day
      // the customer asked to backfill.
      assert.strictEqual(connector._parseDate('2024-01-15T23:00:00-05:00'), Date.UTC(2024, 0, 15));
      assert.strictEqual(
        connector._parseDate(new Date(Date.UTC(2024, 0, 15, 13, 45))),
        Date.UTC(2024, 0, 15),
        'a Date is pinned to UTC midnight so the day-by-day loop stays aligned'
      );
      assert.strictEqual(
        connector._parseDate(Date.UTC(2024, 0, 15, 13, 45)),
        Date.UTC(2024, 0, 15),
        'a numeric epoch is pinned to UTC midnight too'
      );
      // The old split('-') accepted unpadded components, so a stored config
      // using them must not start failing.
      assert.strictEqual(connector._parseDate('2024-1-5'), Date.UTC(2024, 0, 5));
      // main parity: out-of-range components roll over (Date.UTC semantics)
      // rather than erroring. That is parity, not this fix's business.
      assert.strictEqual(connector._parseDate('2024-13-45'), Date.UTC(2024, 12, 45));
    });

    it('_parseDate returns NaN for anything it cannot read', () => {
      const connector = new AbstractConnector(
        createTestContext(),
        createMockSource(),
        createMockStorageClass()
      );
      const unreadable = [
        '15/01/2024',
        'not-a-date',
        '',
        '   ',
        '2024-01',
        '2024-01-15xyz',
        null,
        undefined,
        {},
        new Date('nope'),
      ];
      for (const value of unreadable) {
        assert.ok(
          Number.isNaN(connector._parseDate(value)),
          `${JSON.stringify(value) ?? String(value)} must not parse to a date`
        );
      }
    });

    it('_iterateDates throws on an unparseable bound instead of yielding nothing', () => {
      const connector = new AbstractConnector(
        createTestContext(),
        createMockSource(),
        createMockStorageClass()
      );
      // A NaN bound makes `t <= endMs` false on the very first check, so the
      // generator completes without a single day. It must fail instead.
      // The guard lives in the generator body, so it only runs once the
      // consumer pulls -- which is exactly what processTimeSeriesNode does.
      assert.throws(() => {
        for (const _date of connector._iterateDates('15/01/2024', '2024-01-16')) {
          assert.fail('no day may be yielded from an unreadable range');
        }
      }, /15\/01\/2024/);
      assert.throws(() => {
        for (const _date of connector._iterateDates('2024-01-15', 'whenever')) {
          assert.fail('no day may be yielded from an unreadable range');
        }
      }, /whenever/);
    });
  });

  describe('D2 regression: a repeated account id made a fully-failed run report success', () => {
    // _reportSkippedAccounts compared skippedAccounts.size (a Map keyed by
    // account id) against accounts.length (the raw array). `AccountIDs =
    // "act_1, act_1"` -- a copy-paste every multi-account source accepts --
    // yields two array entries but one Map entry, so the "every account was
    // skipped" check (1 >= 2) was false and an expired token landed on the
    // partial-skip path: CONTROL(completed), zero rows, one WARN line. Both
    // sides must be counted the same way, so the key is now derived in one
    // place (_accountKey) and used for the Map key and the attempted count.

    it('duplicate account id + expired token fails the run and does NOT report a partial skip', async () => {
      const restore = suppressStdout();
      try {
        const ctx = createTestContext();
        const warnings = captureWarnings(ctx);
        const source = createMockSource({
          getAccounts: () => [{ id: 'act_1' }, { id: 'act_1' }],
          fetchData: async () => {
            throw Object.assign(new Error('Token has expired'), { isWarning: true });
          },
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        const error = await connector.run().then(
          () => null,
          e => e
        );
        assert.ok(error, 'a run that imported nothing must not resolve');
        assert.match(error.message, /All 1 accounts were skipped/);
        assert.match(error.message, /act_1: Token has expired/);
        assert.strictEqual(error.isWarning, true);
        assert.ok(
          !warnings.some(w => w.includes('out of')),
          'the partial-skip warning must not fire when every distinct account was skipped'
        );
      } finally {
        restore();
      }
    });

    it('three entries, two distinct accounts, one imports: completes with a DISTINCT-count warning', async () => {
      const cap = captureEvents();
      try {
        const ctx = createTestContext();
        const fetched = [];
        const source = createMockSource({
          getAccounts: () => [{ id: 'revoked' }, { id: 'revoked' }, { id: 'working' }],
          fetchData: async req => {
            if (req.accountId === 'revoked') {
              throw Object.assign(new Error('(#200) Ad account owner has NOT grant ads_read'), {
                isWarning: true,
              });
            }
            fetched.push(req.accountId);
            return [{ id: 1 }];
          },
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await connector.run();

        assert.deepStrictEqual(fetched, ['working'], 'the reachable account must still import');
        const controls = cap.events.filter(e => e.type === 'CONTROL');
        assert.ok(
          controls.some(e => e.action === 'completed'),
          'a partial skip still completes -- only a total skip fails the run'
        );
        const warnings = cap.events
          .filter(e => e.type === 'LOG' && e.level === 'warn')
          .map(e => e.message);
        assert.ok(
          warnings.some(w => w.includes('1 out of 2 accounts were skipped')),
          `the summary must count DISTINCT accounts (2), not array entries (3); got: ${warnings.join(' | ')}`
        );
      } finally {
        cap.restore();
      }
    });
  });

  describe('D3 regression: an empty account list was a silent no-op success', () => {
    // `getAccounts(...) || [null]` never fired its fallback for `[]`, because
    // `[]` is truthy. `AccountIDs = ","` parses to `[]` -- AccountResolver and
    // every hand-written getAccounts .filter(Boolean) the blanks away -- so the
    // account loop body never ran and the run emitted CONTROL(completed) having
    // imported nothing. null/undefined and [] mean opposite things and must be
    // told apart.

    it('an empty account array fails the run, fetches nothing, and never reports completed', async () => {
      const cap = captureEvents();
      try {
        const ctx = createTestContext();
        const fetchCalls = [];
        const source = createMockSource({
          getAccounts: () => [],
          fetchData: async req => {
            fetchCalls.push(req);
            return [{ id: 1 }];
          },
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        const error = await connector.run().then(
          () => null,
          e => e
        );
        assert.ok(error, 'resolving zero accounts is a configuration error, not a no-op success');
        assert.match(error.message, /zero accounts/);
        assert.match(error.message, /AccountIDs/, 'the message must name the likely parameter');
        // Safe to flag here -- unlike D1's date error this is thrown OUTSIDE
        // the account loop, so _skipOrFail can never see it, and
        // RunFailureReport keeps the readable message instead of a stack.
        assert.strictEqual(error.isWarning, true);
        assert.deepStrictEqual(fetchCalls, []);
        const controls = cap.events.filter(e => e.type === 'CONTROL');
        assert.ok(
          !controls.some(e => e.action === 'completed'),
          'a run that imported nothing must never report completed'
        );
      } finally {
        cap.restore();
      }
    });

    it('getAccounts() returning null still makes exactly one pass with a null accountId', async () => {
      // null/undefined means the source has no account concept at all (the
      // AbstractSource.getAccounts default is [null]); that must keep working.
      const restore = suppressStdout();
      try {
        const ctx = createTestContext();
        const seen = [];
        const source = createMockSource({
          getAccounts: () => null,
          fetchData: async req => {
            seen.push(req.accountId);
            return [{ id: 1 }];
          },
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await connector.run();
        assert.deepStrictEqual(seen, [null]);
      } finally {
        restore();
      }
    });
  });

  describe('E1 regression: the incremental cursor advanced per account, losing a later account`s window', () => {
    // The branch nested account (outer) -> node -> day (inner) and emitted
    // StateEvent({lastRequestedDate}) from the innermost loop, which the backend
    // persists immediately (connector-executor.service.ts, fire-and-forget). So
    // account 1 could stream STATE all the way to today BEFORE account 2 was
    // attempted at all: account 2 then failed on its first day and every day
    // after it was never requested -- not in this run (the throw abandoned the
    // account) and not in the next one either (the persisted cursor was already
    // today, so the next run starts at today - ReimportLookbackWindow).
    //
    // main nested it the other way round for exactly this reason: FacebookMarketing
    // ran `for (daysShift) { for (accountId) { for (nodeName) {...} } ;
    // updateLastRequstedDate(startDate) }` -- the cursor moved only after every
    // account x node had finished that day.

    // Builds an INCREMENTAL context whose window is exactly the last `days`
    // calendar days, ending today.
    function incrementalWindow(days) {
      return createTestContext({
        LastRequestedDate: { value: utcDay(-(days - 1)) },
        ReimportLookbackWindow: { value: '0' },
      });
    }

    it('does NOT advance the cursor past a day one account failed, and stops the run there', async () => {
      const cap = captureEvents();
      try {
        const ctx = incrementalWindow(3);
        const [d0, d1, d2] = [utcDay(-2), utcDay(-1), utcDay(0)];
        const attempts = [];
        const source = createMockSource({
          parseFields: () => ({ stats: ['id', 'date'] }),
          getAccounts: () => [{ id: 'acc-1' }, { id: 'acc-2' }],
          getDateStrategy: () => 'day-by-day',
          fetchData: async req => {
            attempts.push(`${req.accountId}@${req.startDate}`);
            if (req.accountId === 'acc-2' && req.startDate === d1) {
              throw new Error('acc-2 upstream 500');
            }
            return [{ id: 1, date: req.startDate }];
          },
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await assert.rejects(() => connector.run(), /acc-2 upstream 500/);

        const cursors = cap.events
          .filter(e => e.type === 'STATE')
          .map(e => e.state.lastRequestedDate);
        assert.deepStrictEqual(
          cursors,
          [d0],
          'the cursor may only reach the last day EVERY account completed; ' +
            `day ${d1} was partially failed so nothing past ${d0} may be persisted`
        );
        // The cursor invariant above survives the fail-fast revert, but the way
        // it is reached changes: a non-permission error aborts at once, so no
        // account sees a day past the failure. That is exactly why the cursor is
        // safe -- the next run resumes at d1 and re-requests it for everyone.
        assert.ok(
          !attempts.some(a => a.endsWith(`@${d2}`)),
          `nothing may be requested for ${d2} after ${d1} failed; got ${attempts.join(', ')}`
        );
        assert.ok(
          attempts.includes(`acc-1@${d1}`),
          'accounts before the failing one still get their day'
        );
      } finally {
        cap.restore();
      }
    });

    it('advances the cursor exactly once per day, in order, when every account succeeds', async () => {
      const cap = captureEvents();
      try {
        const ctx = incrementalWindow(3);
        const source = createMockSource({
          parseFields: () => ({ stats: ['id', 'date'] }),
          getAccounts: () => [{ id: 'acc-1' }, { id: 'acc-2' }],
          getDateStrategy: () => 'day-by-day',
          fetchData: async req => [{ id: 1, date: req.startDate }],
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await connector.run();

        const cursors = cap.events
          .filter(e => e.type === 'STATE')
          .map(e => e.state.lastRequestedDate);
        assert.deepStrictEqual(
          cursors,
          [utcDay(-2), utcDay(-1), utcDay(0)],
          'one checkpoint per completed day, never one per account x day'
        );
      } finally {
        cap.restore();
      }
    });

    it('withholds the cursor for a day no account could complete', async () => {
      // Nothing at all was written for that day, so advancing past it would
      // lose it outright. main guarded this with _throwIfAllAccountsSkipped(),
      // which ran immediately BEFORE updateLastRequstedDate().
      const cap = captureEvents();
      try {
        const ctx = incrementalWindow(2);
        const firstDay = utcDay(-1);
        const source = createMockSource({
          parseFields: () => ({ stats: ['id', 'date'] }),
          getAccounts: () => [{ id: 'acc-1' }, { id: 'acc-2' }],
          getDateStrategy: () => 'day-by-day',
          fetchData: async req => {
            if (req.startDate === firstDay) {
              throw Object.assign(new Error(`no access to ${req.accountId}`), { isWarning: true });
            }
            return [{ id: 1 }];
          },
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await connector.run();

        const cursors = cap.events
          .filter(e => e.type === 'STATE')
          .map(e => e.state.lastRequestedDate);
        assert.deepStrictEqual(cursors, [], `no day may be checkpointed once ${firstDay} was lost`);
      } finally {
        cap.restore();
      }
    });

    it('main parity: a permanently inaccessible account does not freeze the cursor for the others', async () => {
      // The deliberate trade-off main made (FacebookMarketing #1519): a 401/403
      // account stays unreachable however often it is retried, so holding the
      // cursor back for it would make every subsequent run re-import an
      // ever-growing window until it times out -- turning one account's gap into
      // total data loss. The account is attempted on every day and the gap is
      // surfaced as a run warning instead.
      const cap = captureEvents();
      try {
        const ctx = incrementalWindow(3);
        const attempts = [];
        const source = createMockSource({
          parseFields: () => ({ stats: ['id', 'date'] }),
          getAccounts: () => [{ id: 'revoked' }, { id: 'working' }],
          getDateStrategy: () => 'day-by-day',
          fetchData: async req => {
            attempts.push(`${req.accountId}@${req.startDate}`);
            if (req.accountId === 'revoked') {
              throw Object.assign(new Error('(#200) Ad account owner has NOT grant ads_read'), {
                isWarning: true,
              });
            }
            return [{ id: 1 }];
          },
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await connector.run();

        const cursors = cap.events
          .filter(e => e.type === 'STATE')
          .map(e => e.state.lastRequestedDate);
        assert.deepStrictEqual(cursors, [utcDay(-2), utcDay(-1), utcDay(0)]);
        assert.strictEqual(
          attempts.filter(a => a.startsWith('revoked@')).length,
          3,
          'the revoked account is still offered every day of the window'
        );
        const warnings = cap.events
          .filter(e => e.type === 'LOG' && e.level === 'warn')
          .map(e => e.message);
        assert.ok(warnings.some(w => w.includes('1 out of 2 accounts were skipped')));
      } finally {
        cap.restore();
      }
    });

    it('single-account run keeps the days it already completed before the failing one', async () => {
      // The other half of the invariant: holding the cursor back must not throw
      // away progress that WAS written. The run fails fast on the bad day -- but
      // days 1..N-1 were fully written and stay checkpointed (the guarantee
      // XAds/Source.js documents for its per-day async stats nodes).
      const cap = captureEvents();
      try {
        const ctx = incrementalWindow(3);
        const badDay = utcDay(-1);
        const source = createMockSource({
          parseFields: () => ({ stats: ['id', 'date'] }),
          getDateStrategy: () => 'day-by-day',
          fetchData: async req => {
            if (req.startDate === badDay) throw new Error('day two exploded');
            return [{ id: 1 }];
          },
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await assert.rejects(() => connector.run(), /day two exploded/);
        const cursors = cap.events
          .filter(e => e.type === 'STATE')
          .map(e => e.state.lastRequestedDate);
        assert.deepStrictEqual(cursors, [utcDay(-2)]);
      } finally {
        cap.restore();
      }
    });

    it('range strategy: one account failing withholds the window checkpoint', async () => {
      const cap = captureEvents();
      try {
        const ctx = incrementalWindow(3);
        const source = createMockSource({
          parseFields: () => ({ stats: ['id', 'date'] }),
          getAccounts: () => [{ id: 'acc-1' }, { id: 'acc-2' }],
          getDateStrategy: () => 'range',
          fetchData: async req => {
            if (req.accountId === 'acc-2') throw new Error('acc-2 upstream 500');
            return [{ id: 1 }];
          },
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await assert.rejects(() => connector.run(), /acc-2 upstream 500/);
        const states = cap.events.filter(e => e.type === 'STATE');
        assert.deepStrictEqual(states, [], 'a partially imported window must not be checkpointed');
      } finally {
        cap.restore();
      }
    });
  });

  describe('E2: only a permission failure is skipped, everything else aborts the run', () => {
    // main drew the line at `error.isWarning` and nowhere else (FacebookMarketing
    // `_skipOrRethrow`): a 401/403 account is unreachable however often it is
    // retried, so skipping it costs nothing, while an upstream 500 or a storage
    // write failure is a condition the next account is just as likely to hit.
    // Spending the rest of the window rediscovering that one account at a time
    // buys nothing and delays the failure the customer has to act on, so the
    // first such error ends the run.

    it('an upstream 500 on one advertiser ends the run before the next one is tried', async () => {
      const restore = suppressStdout();
      try {
        const ctx = createTestContext();
        const fetched = [];
        const source = createMockSource({
          getAccounts: () => [1, 2, 3, 4, 5].map(n => ({ id: `adv-${n}` })),
          fetchData: async req => {
            if (req.accountId === 'adv-2') {
              throw Object.assign(new Error('Internal Server Error'), { statusCode: 500 });
            }
            fetched.push(req.accountId);
            return [{ id: 1 }];
          },
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await assert.rejects(() => connector.run(), /Internal Server Error/);
        assert.deepStrictEqual(
          fetched,
          ['adv-1'],
          'adv-3..adv-5 must not be attempted once adv-2 failed for a non-permission reason'
        );
      } finally {
        restore();
      }
    });

    it('a failed account never lets the run report plain success', async () => {
      const cap = captureEvents();
      try {
        const ctx = createTestContext();
        const source = createMockSource({
          getAccounts: () => [{ id: 'ok' }, { id: 'broken' }],
          fetchData: async req => {
            if (req.accountId === 'broken') throw new Error('BigQuery write failed');
            return [{ id: 1 }];
          },
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        const error = await connector.run().then(
          () => null,
          e => e
        );
        assert.ok(error, 'a run with a failed account must reject');
        assert.match(error.message, /BigQuery write failed/);
        const controls = cap.events.filter(e => e.type === 'CONTROL');
        assert.ok(!controls.some(e => e.action === 'completed'));
        assert.ok(controls.some(e => e.action === 'failed'));
        // main rethrows the original error, which knows nothing about accounts,
        // so the account is named by the log line the engine writes just before
        // rethrowing rather than by the error itself. Without that the customer
        // cannot tell WHICH account of a multi-account run broke.
        const errorLogs = cap.events
          .filter(e => e.type === 'LOG' && e.level === 'error')
          .map(e => e.message);
        assert.ok(
          errorLogs.some(m => m.includes('broken') && m.includes('BigQuery write failed')),
          `the failing account must be named in the log; got: ${errorLogs.join(' | ')}`
        );
      } finally {
        cap.restore();
      }
    });

    it('a skip before a failure is still reported as a skip, and the failure still wins', async () => {
      // Both kinds in one run, in the order that makes them hard to tell apart.
      // "revoked" is skipped and recorded, then "broken" ends the run -- and the
      // skip must not be swallowed by the abort, because the customer needs to
      // know that account's data is missing too.
      const cap = captureEvents();
      try {
        const ctx = createTestContext();
        const fetched = [];
        const source = createMockSource({
          getAccounts: () => [{ id: 'revoked' }, { id: 'broken' }, { id: 'fine' }],
          fetchData: async req => {
            if (req.accountId === 'revoked') {
              throw Object.assign(new Error('token cannot reach revoked'), { isWarning: true });
            }
            if (req.accountId === 'broken') throw new Error('upstream exploded');
            fetched.push(req.accountId);
            return [{ id: 1 }];
          },
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        const error = await connector.run().then(
          () => null,
          e => e
        );
        assert.ok(error);
        assert.match(error.message, /upstream exploded/, 'the real failure is what surfaces');
        assert.ok(
          !/token cannot reach revoked/.test(error.message),
          'a permission skip is reported as a skip, not folded into the failure'
        );
        assert.deepStrictEqual(fetched, [], '"fine" is never reached once "broken" failed');
        const warnings = cap.events
          .filter(e => e.type === 'LOG' && e.level === 'warn')
          .map(e => e.message);
        assert.ok(
          warnings.some(w => w.includes('Skipped account revoked')),
          `the skip must still be reported; got: ${warnings.join(' | ')}`
        );
      } finally {
        cap.restore();
      }
    });
  });

  describe('E3 regression: processFullRefreshNode truncated the table once per account', () => {
    // replaceData(data || []) ran inside the per-account loop with no
    // accumulation, so an `accounts` block plus isFullRefresh: true meant each
    // account truncated and rewrote the destination table and only the LAST
    // account's rows survived.

    function fullRefreshSource(overrides = {}) {
      return createMockSource({
        fieldsSchema: {
          sheet: {
            fields: { id: { type: 'INTEGER' } },
            uniqueKeys: ['id'],
            isFullRefresh: true,
            destinationName: 'sheet',
          },
        },
        parseFields: () => ({ sheet: ['id'] }),
        ...overrides,
      });
    }

    it('replaces the table once, with every account`s rows', async () => {
      const restore = suppressStdout();
      try {
        const ctx = createTestContext();
        const source = fullRefreshSource({
          getAccounts: () => [{ id: 'a' }, { id: 'b' }],
          fetchData: async req => [{ id: `${req.accountId}-1` }, { id: `${req.accountId}-2` }],
        });
        const StorageClass = createMockStorageClass();
        const connector = new AbstractConnector(ctx, source, StorageClass);
        await connector.run();

        const calls = StorageClass.instances.flatMap(s => s.replaceCalls);
        assert.strictEqual(calls.length, 1, 'the table may be replaced exactly once');
        assert.deepStrictEqual(
          calls[0].map(r => r.id),
          ['a-1', 'a-2', 'b-1', 'b-2']
        );
      } finally {
        restore();
      }
    });

    it('a source returning undefined logs "No data rows were fetched" instead of throwing', async () => {
      const cap = captureEvents();
      try {
        const ctx = createTestContext();
        const source = fullRefreshSource({ fetchData: async () => undefined });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await connector.run();
        const logs = cap.events.filter(e => e.type === 'LOG').map(e => e.message);
        assert.ok(
          logs.some(m => m.includes('No data rows were fetched')),
          `expected the empty-fetch log line; got ${logs.join(' | ')}`
        );
      } finally {
        cap.restore();
      }
    });

    it('CreateEmptyTables=false suppresses the empty-snapshot truncate', async () => {
      const restore = suppressStdout();
      try {
        const ctx = createTestContext({ CreateEmptyTables: { value: false } });
        const source = fullRefreshSource({ fetchData: async () => [] });
        const StorageClass = createMockStorageClass();
        const connector = new AbstractConnector(ctx, source, StorageClass);
        await connector.run();
        assert.deepStrictEqual(
          StorageClass.instances.flatMap(s => s.replaceCalls),
          [],
          'an operator who disabled empty tables must not get the table truncated'
        );
      } finally {
        restore();
      }
    });

    it('main parity: an empty snapshot still publishes when CreateEmptyTables is not configured', async () => {
      // main's GoogleSheetsConnector called `storage.replaceData(data)`
      // unconditionally, and GoogleSheets/Source.js declares no
      // CreateEmptyTables parameter at all. Publishing the empty snapshot is
      // how rows deleted upstream disappear downstream -- the entire point of
      // full-refresh mode -- so an absent parameter must not suppress it.
      const restore = suppressStdout();
      try {
        const ctx = createTestContext();
        const source = fullRefreshSource({ fetchData: async () => [] });
        const StorageClass = createMockStorageClass();
        const connector = new AbstractConnector(ctx, source, StorageClass);
        await connector.run();
        assert.deepStrictEqual(
          StorageClass.instances.flatMap(s => s.replaceCalls),
          [[]]
        );
      } finally {
        restore();
      }
    });
  });

  describe('E4 regression: a time-series node with no incremental strategy looped day by day', () => {
    // DeclarativeSource.getDateStrategy returns DATE_STRATEGY.NONE when a node
    // has no incremental.strategy, and ManifestParser does not require an
    // incremental block for isTimeSeries: true. AbstractConnector only
    // special-cased RANGE and funnelled everything else -- 'none' included --
    // into the day-by-day loop, while DeclarativeSource._withDateWindow returns
    // the spec unchanged for 'none'. A builder-authored manifest therefore
    // issued one IDENTICAL request per day of the window (45-75 of them on a
    // first run) and wrote that many duplicate batches.

    it('makes exactly one dateless fetch instead of one per day', async () => {
      const restore = suppressStdout();
      try {
        const ctx = createTestContext({
          LastRequestedDate: { value: utcDay(-30) },
          ReimportLookbackWindow: { value: '0' },
        });
        const fetchCalls = [];
        const source = createMockSource({
          parseFields: () => ({ stats: ['id'] }),
          getDateStrategy: () => 'none',
          fetchData: async req => {
            fetchCalls.push(req);
            return [{ id: 1 }];
          },
        });
        const StorageClass = createMockStorageClass();
        const connector = new AbstractConnector(ctx, source, StorageClass);
        await connector.run();

        assert.strictEqual(
          fetchCalls.length,
          1,
          `a node with no date window has exactly one request to make; made ${fetchCalls.length}`
        );
        assert.strictEqual(fetchCalls[0].startDate, null);
        assert.strictEqual(fetchCalls[0].endDate, null);
        assert.strictEqual(StorageClass.instances[0].savedData.length, 1);
      } finally {
        restore();
      }
    });

    it('does not checkpoint a cursor it never used', async () => {
      const cap = captureEvents();
      try {
        const ctx = createTestContext({
          LastRequestedDate: { value: utcDay(-3) },
          ReimportLookbackWindow: { value: '0' },
        });
        const source = createMockSource({
          parseFields: () => ({ stats: ['id'] }),
          getDateStrategy: () => 'none',
          fetchData: async () => [{ id: 1 }],
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await connector.run();
        assert.deepStrictEqual(
          cap.events.filter(e => e.type === 'STATE'),
          [],
          'a dateless node contributes nothing to LastRequestedDate'
        );
      } finally {
        cap.restore();
      }
    });
  });

  describe('C1 regression: a range node checkpointed the window before its day-by-day siblings ran', () => {
    // _processTimeSeriesNodes runs every RANGE node to completion BEFORE the
    // shared day loop starts, and _processWindowNode used to end with
    // _advanceCursor(state, completedBy, dateRange.endDate) -- which for an
    // INCREMENTAL run is TODAY. The backend persists that StateEvent
    // immediately and unconditionally (connector-executor.service.ts, a plain
    // overwrite with no max()), so a day-by-day sibling that then failed for
    // every account had nothing left to hold back: `cursorHalted` can only
    // suppress LATER emissions, never retract a persisted one. The sibling's
    // whole window was silently abandoned -- not re-requested by this run, and
    // not by the next one either.
    //
    // No pre-existing test mixes strategies in one run (every test source
    // returns a constant from getDateStrategy), which is exactly why the suite
    // missed this. These do.
    //
    // The invariant: the persisted cursor must never exceed the last day that
    // EVERY time-series node in the run completed.

    function incrementalWindow(days) {
      return createTestContext({
        LastRequestedDate: { value: utcDay(-(days - 1)) },
        ReimportLookbackWindow: { value: '0' },
      });
    }

    // Two time-series nodes in one run: `r` covers the window in a single
    // request per account, `d` walks it day by day.
    function mixedStrategySource(overrides = {}) {
      return createMockSource({
        fieldsSchema: {
          r: { fields: [], uniqueKeys: ['id'], isTimeSeries: true, destinationName: 'r' },
          d: { fields: [], uniqueKeys: ['id'], isTimeSeries: true, destinationName: 'd' },
        },
        parseFields: () => ({ r: ['id'], d: ['id'] }),
        getDateStrategy: name => (name === 'r' ? 'range' : 'day-by-day'),
        getAccounts: () => [{ id: 'acc-1' }, { id: 'acc-2' }],
        ...overrides,
      });
    }

    it('does not checkpoint the window when a day-by-day sibling was skipped for every account', async () => {
      // The reported reproduction: node `r` imports fine, the token has no
      // permission for node `d`, so `d` is skipped for every account on every
      // day. state.succeeded is non-empty (r filled it), so the run COMPLETES
      // with a warning -- and if the window were checkpointed, `d`'s missing
      // days would never be requested again.
      const cap = captureEvents();
      try {
        const ctx = incrementalWindow(3);
        const source = mixedStrategySource({
          fetchData: async req => {
            if (req.nodeName === 'd') {
              throw Object.assign(new Error(`(#200) no ads_read on ${req.accountId}`), {
                isWarning: true,
              });
            }
            return [{ id: 1 }];
          },
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await connector.run();

        const cursors = cap.events
          .filter(e => e.type === 'STATE')
          .map(e => e.state.lastRequestedDate);
        assert.deepStrictEqual(
          cursors,
          [],
          'node "d" imported nothing, so no day of the window may be persisted'
        );
      } finally {
        cap.restore();
      }
    });

    it('does not checkpoint the window when a day-by-day sibling fails the run outright', async () => {
      // The worse variant: a NON-warning error fails the run, so a hard failure
      // would lose MORE data than a soft one if the window were already
      // checkpointed at today.
      const cap = captureEvents();
      try {
        const ctx = incrementalWindow(3);
        const source = mixedStrategySource({
          fetchData: async req => {
            if (req.nodeName === 'd') throw new Error('d upstream 500');
            return [{ id: 1 }];
          },
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await assert.rejects(() => connector.run(), /d upstream 500/);

        const cursors = cap.events
          .filter(e => e.type === 'STATE')
          .map(e => e.state.lastRequestedDate);
        assert.deepStrictEqual(
          cursors,
          [],
          'a failed run must not leave the cursor past days it never imported'
        );
      } finally {
        cap.restore();
      }
    });

    it('a range-only run still advances the cursor, exactly once, to the window end', async () => {
      // The regression guard for the "never progresses" trap: withholding the
      // range node's own emission must not leave an incremental connector that
      // has NO day-by-day node with nothing to checkpoint at all.
      const cap = captureEvents();
      try {
        const ctx = incrementalWindow(3);
        const source = createMockSource({
          parseFields: () => ({ stats: ['id', 'date'] }),
          getAccounts: () => [{ id: 'acc-1' }, { id: 'acc-2' }],
          getDateStrategy: () => 'range',
          fetchData: async () => [{ id: 1 }],
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await connector.run();

        const cursors = cap.events
          .filter(e => e.type === 'STATE')
          .map(e => e.state.lastRequestedDate);
        assert.deepStrictEqual(
          cursors,
          [utcDay(0)],
          'a completed range window is one checkpoint, at its end date'
        );
      } finally {
        cap.restore();
      }
    });

    it('two range nodes: the first completing does not checkpoint what the second never imported', async () => {
      const cap = captureEvents();
      try {
        const ctx = incrementalWindow(3);
        const source = createMockSource({
          fieldsSchema: {
            r1: { fields: [], uniqueKeys: ['id'], isTimeSeries: true, destinationName: 'r1' },
            r2: { fields: [], uniqueKeys: ['id'], isTimeSeries: true, destinationName: 'r2' },
          },
          parseFields: () => ({ r1: ['id'], r2: ['id'] }),
          getAccounts: () => [{ id: 'acc-1' }, { id: 'acc-2' }],
          getDateStrategy: () => 'range',
          fetchData: async req => {
            if (req.nodeName === 'r2') {
              throw Object.assign(new Error(`no access to ${req.accountId} stats`), {
                isWarning: true,
              });
            }
            return [{ id: 1 }];
          },
        });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await connector.run();

        const cursors = cap.events
          .filter(e => e.type === 'STATE')
          .map(e => e.state.lastRequestedDate);
        assert.deepStrictEqual(
          cursors,
          [],
          'node "r2" imported nothing, so the window it shares with "r1" stays unclaimed'
        );
      } finally {
        cap.restore();
      }
    });

    it('mixed run where everything succeeds still checkpoints per day, and only per day', async () => {
      // The other side of the correction: withholding the range node's
      // checkpoint must NOT collapse into "never checkpoint". A long day-by-day
      // run stays resumable because each completed day is still persisted as it
      // finishes.
      const cap = captureEvents();
      try {
        const ctx = incrementalWindow(3);
        const source = mixedStrategySource({ fetchData: async () => [{ id: 1 }] });
        const connector = new AbstractConnector(ctx, source, createMockStorageClass());
        await connector.run();

        const cursors = cap.events
          .filter(e => e.type === 'STATE')
          .map(e => e.state.lastRequestedDate);
        assert.deepStrictEqual(
          cursors,
          [utcDay(-2), utcDay(-1), utcDay(0)],
          'one checkpoint per completed day, and no extra one from the range node'
        );
      } finally {
        cap.restore();
      }
    });
  });

  describe('C2 regression: a skipped account let a partial full-refresh snapshot replace the table', () => {
    // processFullRefreshNode accumulates one batch per account and calls
    // replaceData(rows) ONCE -- but _runForAccount swallows an `isWarning`
    // failure, so a skipped account simply contributes no batch. replaceData is
    // a real truncate-and-swap (GoogleBigQueryStorage.replaceData stages, then
    // publishes over the live table, with no empty-snapshot guard of its own),
    // so the partial snapshot DELETED the rows the skipped account had imported
    // on earlier runs -- and, because state.succeeded was non-empty, the run
    // reported COMPLETED while doing it.
    //
    // With every account skipped the snapshot is empty, and CreateEmptyTables
    // defaults to TRUE for declarative manifests (ManifestParser), so the
    // `rows.length === 0 && createEmptyTables === false` guard does not engage
    // either: an expired token replaced the live table with zero rows and only
    // THEN did _reportAccountOutcomes throw.
    //
    // main had no such window: startImportProcess called fetchData() with no
    // try/catch, so any error aborted before the destructive write.

    function fullRefreshSource(overrides = {}) {
      return createMockSource({
        fieldsSchema: {
          sheet: {
            fields: { id: { type: 'INTEGER' } },
            uniqueKeys: ['id'],
            isFullRefresh: true,
            destinationName: 'sheet',
          },
        },
        parseFields: () => ({ sheet: ['id'] }),
        ...overrides,
      });
    }

    it('a partial snapshot never reaches replaceData, and never reports plain success', async () => {
      const cap = captureEvents();
      try {
        const ctx = createTestContext();
        const source = fullRefreshSource({
          getAccounts: () => [{ id: 'a' }, { id: 'b' }],
          fetchData: async req => {
            if (req.accountId === 'b') {
              throw Object.assign(new Error('token cannot reach b'), { isWarning: true });
            }
            return [{ id: 'a-1' }, { id: 'a-2' }];
          },
        });
        const StorageClass = createMockStorageClass();
        const connector = new AbstractConnector(ctx, source, StorageClass);
        const error = await connector.run().then(
          () => null,
          e => e
        );

        assert.deepStrictEqual(
          StorageClass.instances.flatMap(s => s.replaceCalls),
          [],
          'replacing the table with only account "a" rows would delete everything "b" imported before'
        );
        assert.ok(error, 'an incomplete snapshot cannot express "replace", so the run must fail');
        assert.match(
          error.message,
          /\bb\b/,
          'the message must name the account whose rows are missing'
        );
        const controls = cap.events.filter(e => e.type === 'CONTROL');
        assert.ok(
          !controls.some(e => e.action === 'completed'),
          'a run that could not build the whole snapshot must never report completed'
        );
        // The partial-snapshot error is deliberately flagged `isWarning` (see
        // processFullRefreshNode), so run() no longer announces it as a CONTROL
        // `failed` -- that would be an ERROR-severity duplicate of the WARNING
        // the runner files through RunFailureReport. The invariant this case
        // protects is "the run FAILS and the table is untouched", which the
        // thrown error above and the absent `completed` event already pin; the
        // assertion here is that the failure travels as a warning rather than
        // that it travels as a CONTROL event.
        assert.strictEqual(error.isWarning, true);
        assert.ok(
          !controls.some(e => e.action === 'failed'),
          'a flagged failure must not also be announced at ERROR severity'
        );
      } finally {
        cap.restore();
      }
    });

    it('an expired token that skips every account does not wipe the table', async () => {
      const cap = captureEvents();
      try {
        // CreateEmptyTables is TRUE, as ManifestParser defaults it for every
        // declarative manifest -- so the existing empty-snapshot guard is off
        // and only the skip check stands between an expired token and the data.
        const ctx = createTestContext({ CreateEmptyTables: { value: true } });
        const source = fullRefreshSource({
          getAccounts: () => [{ id: 'a' }, { id: 'b' }],
          fetchData: async req => {
            throw Object.assign(new Error(`session expired for ${req.accountId}`), {
              isWarning: true,
            });
          },
        });
        const StorageClass = createMockStorageClass();
        const connector = new AbstractConnector(ctx, source, StorageClass);
        const error = await connector.run().then(
          () => null,
          e => e
        );

        assert.deepStrictEqual(
          StorageClass.instances.flatMap(s => s.replaceCalls),
          [],
          'an expired token must not replace the live table with zero rows'
        );
        assert.ok(error, 'a run that fetched nothing at all must fail');
        const controls = cap.events.filter(e => e.type === 'CONTROL');
        assert.ok(!controls.some(e => e.action === 'completed'));
      } finally {
        cap.restore();
      }
    });

    it('a complete snapshot still replaces the table once, with every account`s rows', async () => {
      // The guard against over-correcting: when nothing was skipped the
      // destructive write is exactly what full-refresh mode is for.
      const cap = captureEvents();
      try {
        const ctx = createTestContext();
        const source = fullRefreshSource({
          getAccounts: () => [{ id: 'a' }, { id: 'b' }],
          fetchData: async req => [{ id: `${req.accountId}-1` }, { id: `${req.accountId}-2` }],
        });
        const StorageClass = createMockStorageClass();
        const connector = new AbstractConnector(ctx, source, StorageClass);
        await connector.run();

        const calls = StorageClass.instances.flatMap(s => s.replaceCalls);
        assert.strictEqual(calls.length, 1, 'the table may be replaced exactly once');
        assert.deepStrictEqual(
          calls[0].map(r => r.id),
          ['a-1', 'a-2', 'b-1', 'b-2']
        );
        assert.ok(cap.events.some(e => e.type === 'CONTROL' && e.action === 'completed'));
      } finally {
        cap.restore();
      }
    });
  });
});
