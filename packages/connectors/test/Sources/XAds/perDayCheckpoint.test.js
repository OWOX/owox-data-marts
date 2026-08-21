import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { loadGasClass } from '../../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

globalThis.DateUtils = { formatDate: date => date.toISOString().slice(0, 10) };
globalThis.RUN_CONFIG_TYPE = { INCREMENTAL: 'INCREMENTAL', MANUAL_BACKFILL: 'MANUAL_BACKFILL' };

// Chunking decides how far the cursor advances per job, so use the real helper rather
// than a copy that would keep passing if the production chunk size changed. Its
// top-level `const` shadows any globalThis stub, so the whole helper is the real one.
// It has to be read back with a vm eval for the same reason.
loadGasClass(path.join(__dirname, '../../../src/Sources/XAds/Helper.js'));
const XAdsHelper = vm.runInThisContext('XAdsHelper');
const DAYS_PER_CHUNK = XAdsHelper.splitDatesIntoChunks(
  Array.from({ length: 500 }, (_, i) => `d${i}`)
)[0].length;

// Fields is configured as a flat "nodeName fieldName, nodeName fieldName" string.
const toFieldsString = nodes =>
  Object.entries(nodes)
    .flatMap(([nodeName, fields]) => fields.map(field => `${nodeName} ${field}`))
    .join(', ');

loadGasClass(path.join(__dirname, '../../../src/Sources/XAds/Connector.js'), {
  AbstractConnector: class {},
});

const connectorProto = globalThis.XAdsConnector.prototype;

const SYNC_NODE = 'stats';
const ASYNC_NODE = 'stats_by_country';
const CATALOG_NODE = 'campaigns';

const START_DATE = new Date('2026-08-10T00:00:00Z');
const dayFromStart = offset =>
  new Date(START_DATE.getTime() + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const buildConnector = ({
  accountIds = 'acc1',
  nodes = { [SYNC_NODE]: ['spend'] },
  runType = 'INCREMENTAL',
  startDate = START_DATE,
  daysToFetch = 3,
  fetchData = async () => [{ spend: 1 }],
  saveData = async () => undefined,
} = {}) => {
  const cursorMovedTo = [];
  const fetched = [];
  const cacheCleared = [];

  const self = Object.create(connectorProto);
  self.runConfig = { type: runType };
  self.source = {
    fieldsSchema: {
      [SYNC_NODE]: { isTimeSeries: true, uniqueKeys: ['spend'] },
      [ASYNC_NODE]: { isTimeSeries: true, asyncTimeSeries: true, uniqueKeys: ['spend'] },
      [CATALOG_NODE]: { isTimeSeries: false },
    },
    clearCache: accountId => cacheCleared.push(accountId),
    fetchData: async params => {
      if (params.dateChunk) {
        fetched.push(`${params.accountId}/${params.nodeName}/[${params.dateChunk.join(',')}]`);
        for (const formatted of params.dateChunk) {
          await params.onBatchReady(formatted, await fetchData({ ...params, day: formatted }));
        }
        return [];
      }

      fetched.push(`${params.accountId}/${params.nodeName}/${params.start_time ?? 'catalog'}`);
      return fetchData({ ...params, day: params.start_time });
    },
  };
  self.getStorageByNode = async () => ({ saveData });
  self.addMissingFieldsToData = data => data;
  self.getStartDateAndDaysToFetch = () => [startDate, daysToFetch];
  self.config = {
    AccountIDs: { value: accountIds },
    Fields: { value: toFieldsString(nodes) },
    CreateEmptyTables: { value: false },
    logMessage: () => {},
    updateLastRequstedDate: date => cursorMovedTo.push(new Date(date).toISOString().slice(0, 10)),
  };

  return { self, cursorMovedTo, fetched, cacheCleared };
};

describe('incremental checkpointing without async nodes', () => {
  it('saves the cursor after each completed day instead of only at the end', async () => {
    const { self, cursorMovedTo } = buildConnector();

    await connectorProto.startImportProcess.call(self);

    expect(cursorMovedTo).toEqual(['2026-08-10', '2026-08-11', '2026-08-12']);
  });

  it('keeps the days already imported when a later day fails', async () => {
    const { self, cursorMovedTo } = buildConnector({
      fetchData: async ({ day }) => {
        if (day === '2026-08-12') throw new Error('Connector died');
        return [{ spend: 1 }];
      },
    });

    await expect(connectorProto.startImportProcess.call(self)).rejects.toThrow('Connector died');

    expect(cursorMovedTo).toEqual(['2026-08-10', '2026-08-11']);
  });

  it('does not move the cursor past a day whose storage write failed', async () => {
    const { self, cursorMovedTo } = buildConnector({
      saveData: async () => {
        throw new Error('BigQuery write failed');
      },
    });

    await expect(connectorProto.startImportProcess.call(self)).rejects.toThrow(
      'BigQuery write failed'
    );

    expect(cursorMovedTo).toEqual([]);
  });

  it('never moves the incremental cursor during a manual backfill', async () => {
    const { self, cursorMovedTo } = buildConnector({ runType: 'MANUAL_BACKFILL' });

    await connectorProto.startImportProcess.call(self);

    expect(cursorMovedTo).toEqual([]);
  });
});

describe('multiple accounts', () => {
  it('completes a date for every account before moving the cursor', async () => {
    const { self, cursorMovedTo, fetched } = buildConnector({
      accountIds: 'acc1,acc2',
      daysToFetch: 2,
    });

    await connectorProto.startImportProcess.call(self);

    expect(fetched).toEqual([
      `acc1/${SYNC_NODE}/2026-08-10`,
      `acc2/${SYNC_NODE}/2026-08-10`,
      `acc1/${SYNC_NODE}/2026-08-11`,
      `acc2/${SYNC_NODE}/2026-08-11`,
    ]);
    expect(cursorMovedTo).toEqual(['2026-08-10', '2026-08-11']);
  });

  it('does not checkpoint a date that only the first account imported', async () => {
    const { self, cursorMovedTo } = buildConnector({
      accountIds: 'acc1,acc2',
      fetchData: async ({ accountId, day }) => {
        if (accountId === 'acc2' && day === '2026-08-11') throw new Error('Account acc2 failed');
        return [{ spend: 1 }];
      },
    });

    await expect(connectorProto.startImportProcess.call(self)).rejects.toThrow(
      'Account acc2 failed'
    );

    expect(cursorMovedTo).toEqual(['2026-08-10']);
  });
});

describe('async nodes', () => {
  it('checkpoints once per job chunk, after every account finished the chunk', async () => {
    // An async node submits one job per chunk of dates, so the cursor can only move
    // in whole chunks — but it still moves mid-run instead of once at the very end.
    const { self, cursorMovedTo, fetched } = buildConnector({
      accountIds: 'acc1,acc2',
      nodes: { [ASYNC_NODE]: ['spend'] },
      daysToFetch: DAYS_PER_CHUNK + 1,
    });

    await connectorProto.startImportProcess.call(self);

    expect(fetched).toHaveLength(4);
    expect(fetched[0]).toContain(`acc1/${ASYNC_NODE}/[2026-08-10,`);
    expect(fetched[1]).toContain(`acc2/${ASYNC_NODE}/[2026-08-10,`);
    expect(cursorMovedTo).toEqual([dayFromStart(DAYS_PER_CHUNK - 1), dayFromStart(DAYS_PER_CHUNK)]);
  });

  it('keeps a finished chunk when the next one fails', async () => {
    const { self, cursorMovedTo } = buildConnector({
      nodes: { [ASYNC_NODE]: ['spend'] },
      daysToFetch: DAYS_PER_CHUNK + 1,
      fetchData: async ({ day }) => {
        if (day === dayFromStart(DAYS_PER_CHUNK)) throw new Error('Async job failed');
        return [{ spend: 1 }];
      },
    });

    await expect(connectorProto.startImportProcess.call(self)).rejects.toThrow('Async job failed');

    expect(cursorMovedTo).toEqual([dayFromStart(DAYS_PER_CHUNK - 1)]);
  });

  it('completes both node kinds for a chunk before checkpointing it', async () => {
    // Two independent loops would move the cursor forward for one node kind and then
    // back to day one for the other. A single chunk loop keeps it monotonic.
    const { self, cursorMovedTo } = buildConnector({
      nodes: { [SYNC_NODE]: ['spend'], [ASYNC_NODE]: ['spend'] },
      daysToFetch: 2,
    });

    await connectorProto.startImportProcess.call(self);

    expect(cursorMovedTo).toEqual(['2026-08-11']);
  });

  it('rejects an async node whose unique keys are not selected, before fetching', async () => {
    const { self, fetched } = buildConnector({ nodes: { [ASYNC_NODE]: ['impressions'] } });

    await expect(connectorProto.startImportProcess.call(self)).rejects.toThrow(
      /Missing required unique fields for 'stats_by_country'/
    );

    expect(fetched).toEqual([]);
  });
});

describe('cache and node types', () => {
  it('clears each account cache once the whole range is done', async () => {
    // Clearing per account mid-run would drop promoted tweet IDs that later dates reuse.
    const { self, cacheCleared } = buildConnector({ accountIds: 'acc1,acc2' });

    await connectorProto.startImportProcess.call(self);

    expect(cacheCleared).toEqual(['acc1', 'acc2']);
  });

  it('clears the cache even when the import fails', async () => {
    const { self, cacheCleared } = buildConnector({
      fetchData: async () => {
        throw new Error('Connector died');
      },
    });

    await expect(connectorProto.startImportProcess.call(self)).rejects.toThrow('Connector died');

    expect(cacheCleared).toEqual(['acc1']);
  });

  it('imports catalog nodes once per account, before any day is requested', async () => {
    const { self, fetched } = buildConnector({
      nodes: { [CATALOG_NODE]: ['id'], [SYNC_NODE]: ['spend'] },
      daysToFetch: 2,
    });

    await connectorProto.startImportProcess.call(self);

    expect(fetched[0]).toBe(`acc1/${CATALOG_NODE}/catalog`);
    expect(fetched.filter(entry => entry.includes(CATALOG_NODE))).toHaveLength(1);
  });

  it('imports nothing when the range has no days left to fetch', async () => {
    const { self, cursorMovedTo, fetched } = buildConnector({ daysToFetch: 0 });

    await connectorProto.startImportProcess.call(self);

    expect(fetched).toEqual([]);
    expect(cursorMovedTo).toEqual([]);
  });
});
