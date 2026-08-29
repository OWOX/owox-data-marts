// packages/connectors/tests/regression/storage-node-scoped-config.test.js
//
// Two behaviours the per-connector Connector.js files carried that were lost
// when they were deleted and their logic centralised into
// Core/AbstractConnector.js. Both are about the SAME thing: the config a
// storage sees must describe the node it is about to write, not the run as a
// whole.
//
// 1. Merge keys (main: TikTokAds/Connector.js `getStorageByNode`, which built
//    the storage from `source.getUniqueKeysForNode(nodeName, dataLevel)` rather
//    than from the static schema list). TikTok's `ad_insights` schema declares
//    uniqueKeys ['ad_id', 'stat_time_day', 'advertiser_id'], but a report run at
//    DataLevel=AUCTION_CAMPAIGN/ADGROUP/ADVERTISER has no ad_id in its rows at
//    all -- the key set is campaign_id/adgroup_id/(nothing) instead. Handing the
//    static list to storage makes AbstractStorage.getUniqueKeyByRecordFields()
//    throw "'ad_id' value is required for Unique Key" on the first record, so
//    every non-AUCTION_AD TikTok data mart that worked on main fails.
//
// 2. Selected fields (main: CriteoAds/Connector.js `_buildStorageConfig`, which
//    rewrote the storage-visible `Fields` to THIS node's fields plus the unique
//    keys, force-included). Storage reads its CREATE TABLE column list from
//    Fields via AbstractStorage.getSelectedFields(), which strips the node
//    prefix -- so without the rewrite a node's table is created from the union
//    of every selected node's fields, and a unique key that is injected after
//    the fetch (Criteo's `day`) never appears in the column list even though it
//    is named in `PRIMARY KEY (...)`.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AbstractConnector } from '../../src/Core/AbstractConnector.js';
import { AbstractContext } from '../../src/Core/AbstractContext.js';
import { AbstractStorage } from '../../src/Core/AbstractStorage.js';
import { TikTokAdsSource } from '../../src/Sources/TikTokAds/Source.js';

function createTestContext(sourceConfig = {}, runConfig = {}) {
  return new AbstractContext({
    source: { name: 'TestSource', config: sourceConfig },
    storage: { name: 'TestStorage', config: {} },
    runConfig,
    env: { datamartId: 'dm-1', runId: 'run-1' },
  });
}

// Extends the real AbstractStorage so getSelectedFields() and
// getUniqueKeyByRecordFields() are the production implementations -- the two
// methods that actually observe the regressions.
function createRecordingStorageClass() {
  const instances = [];
  const StorageClass = class RecordingStorage extends AbstractStorage {
    constructor(context, uniqueKeys, schema, destinationName) {
      super(context, uniqueKeys, schema, destinationName);
      this.destinationName = destinationName;
      // Snapshot of what a real storage would build its CREATE TABLE from,
      // taken at the moment init() runs -- i.e. with whatever node the context
      // was pointing at when this node's first write happened.
      this.initSnapshot = null;
      this.savedData = [];
      instances.push(this);
    }
    async init() {
      this.initSnapshot = {
        table: this.context.getParameter('DestinationTableName')?.value ?? null,
        selectedFields: this.getSelectedFields(),
        uniqueKeyColumns: [...this.uniqueKeyColumns],
      };
    }
    async saveData(data) {
      // Mirrors what every real storage does per record before writing.
      for (const record of data) {
        this.getUniqueKeyByRecordFields(record);
      }
      this.savedData.push(...data);
    }
  };
  StorageClass.instances = instances;
  return StorageClass;
}

function suppressStdout() {
  const original = process.stdout.write;
  process.stdout.write = () => true;
  return () => {
    process.stdout.write = original;
  };
}

function createMockSource(overrides = {}) {
  return {
    fieldsSchema: {},
    parseFields: () => ({}),
    getAccounts: () => [null],
    getDateStrategy: () => 'day-by-day',
    getDestinationName: (name, schema) => schema?.destinationName || name,
    fetchData: async () => [],
    onAccountComplete: () => {},
    onAccountError: () => {},
    onImportComplete: () => {},
    ...overrides,
  };
}

describe('regression: storage config is scoped to the node being written', () => {
  describe('merge keys (main: TikTokAdsConnector.getStorageByNode)', () => {
    it("asks the source for a node's unique keys instead of using the static schema list", async () => {
      const restore = suppressStdout();
      try {
        // The static schema list is the AUCTION_AD one; the run is at
        // AUCTION_CAMPAIGN, so campaign_id -- not ad_id -- identifies a row.
        const ctx = createTestContext({
          Fields: {
            value: 'ad_insights campaign_id, ad_insights stat_time_day, ad_insights spend',
          },
        });
        const source = createMockSource({
          fieldsSchema: {
            ad_insights: {
              fields: {},
              uniqueKeys: ['ad_id', 'stat_time_day', 'advertiser_id'],
              isTimeSeries: false,
              destinationName: 'ad_insights',
            },
          },
          parseFields: () => ({ ad_insights: ['campaign_id', 'stat_time_day', 'spend'] }),
          getUniqueKeysForNode: () => ['campaign_id', 'stat_time_day', 'advertiser_id'],
          // A row at this data level simply has no ad_id key.
          fetchData: async () => [
            { campaign_id: 'c-1', stat_time_day: '2024-01-01', advertiser_id: 'a-1', spend: 1 },
          ],
        });
        const StorageClass = createRecordingStorageClass();

        // Today this rejects with "'ad_id' value is required for Unique Key".
        await new AbstractConnector(ctx, source, StorageClass).run();

        assert.deepEqual(StorageClass.instances[0].initSnapshot.uniqueKeyColumns, [
          'campaign_id',
          'stat_time_day',
          'advertiser_id',
        ]);
      } finally {
        restore();
      }
    });

    it('falls back to the schema list for a source that declares no hook', async () => {
      const restore = suppressStdout();
      try {
        const ctx = createTestContext({ Fields: { value: 'campaigns id' } });
        const source = createMockSource({
          fieldsSchema: {
            campaigns: {
              fields: {},
              uniqueKeys: ['id'],
              isTimeSeries: false,
              destinationName: 'campaigns',
            },
          },
          parseFields: () => ({ campaigns: ['id'] }),
          fetchData: async () => [{ id: 1 }],
        });
        const StorageClass = createRecordingStorageClass();

        await new AbstractConnector(ctx, source, StorageClass).run();

        assert.deepEqual(StorageClass.instances[0].initSnapshot.uniqueKeyColumns, ['id']);
      } finally {
        restore();
      }
    });

    it("TikTokAdsSource resolves DataLevel itself when the engine asks for a node's keys", () => {
      const restore = suppressStdout();
      try {
        // TikTokAdsSource's constructor reads bundle-time globals
        // (CONFIG_ATTRIBUTES), so drive the prototype directly the way
        // test/Sources/TikTokAds/Source.test.js does.
        const makeSource = dataLevel => {
          const source = Object.create(TikTokAdsSource.prototype);
          source.context = createTestContext(dataLevel ? { DataLevel: { value: dataLevel } } : {});
          source.fieldsSchema = { campaigns: { uniqueKeys: ['campaign_id'] } };
          return source;
        };

        // The engine has no idea what a DataLevel is; it passes the node name
        // only, so the source has to resolve the level from its own config.
        const campaignLevel = makeSource('AUCTION_CAMPAIGN');
        assert.deepEqual(campaignLevel.getUniqueKeysForNode('ad_insights'), [
          'campaign_id',
          'stat_time_day',
          'advertiser_id',
        ]);
        assert.deepEqual(campaignLevel.getUniqueKeysForNode('ad_insights_by_country'), [
          'campaign_id',
          'stat_time_day',
          'country_code',
          'advertiser_id',
        ]);

        assert.deepEqual(makeSource('AUCTION_ADVERTISER').getUniqueKeysForNode('ad_insights'), [
          'stat_time_day',
          'advertiser_id',
        ]);

        // Unconfigured DataLevel keeps main's AUCTION_AD default, and a
        // non-insights node keeps its static schema keys.
        const defaultLevel = makeSource(null);
        assert.deepEqual(defaultLevel.getUniqueKeysForNode('ad_insights'), [
          'ad_id',
          'stat_time_day',
          'advertiser_id',
        ]);
        assert.deepEqual(defaultLevel.getUniqueKeysForNode('campaigns'), ['campaign_id']);
      } finally {
        restore();
      }
    });
  });

  describe('selected fields (main: CriteoAdsConnector._buildStorageConfig)', () => {
    it("gives each node a table built from its own fields, not the sibling node's", async () => {
      const restore = suppressStdout();
      try {
        const ctx = createTestContext({
          Fields: {
            value:
              'placements advertiserId, placements adsetId, placements environment, ' +
              'transactions advertiserId, transactions transactionId, transactions revenue',
          },
        });
        const source = createMockSource({
          fieldsSchema: {
            placements: {
              fields: {},
              uniqueKeys: ['advertiserId', 'adsetId', 'day', 'environment', 'placement'],
              isTimeSeries: false,
              destinationName: 'placements',
            },
            transactions: {
              fields: {},
              uniqueKeys: ['advertiserId', 'transactionId'],
              isTimeSeries: false,
              destinationName: 'transactions',
            },
          },
          parseFields: () => ({
            placements: ['advertiserId', 'adsetId', 'environment'],
            transactions: ['advertiserId', 'transactionId', 'revenue'],
          }),
          fetchData: async ({ nodeName }) =>
            nodeName === 'placements'
              ? [
                  {
                    advertiserId: 'a-1',
                    adsetId: 's-1',
                    day: '2024-01-01',
                    environment: 'web',
                    placement: 'p-1',
                  },
                ]
              : [{ advertiserId: 'a-1', transactionId: 't-1', revenue: 10 }],
        });
        const StorageClass = createRecordingStorageClass();

        await new AbstractConnector(ctx, source, StorageClass).run();

        const byTable = Object.fromEntries(
          StorageClass.instances.map(s => [s.initSnapshot.table, s.initSnapshot])
        );

        // `day` and `placement` are unique keys the user never selected, so they
        // must be force-included: PRIMARY KEY names them, and a CREATE TABLE
        // whose PRIMARY KEY names a column absent from the column list fails.
        assert.deepEqual(byTable.placements.selectedFields.sort(), [
          'adsetId',
          'advertiserId',
          'day',
          'environment',
          'placement',
        ]);
        // No trace of the sibling node's fields.
        assert.equal(byTable.placements.selectedFields.includes('transactionId'), false);
        assert.equal(byTable.placements.selectedFields.includes('revenue'), false);

        assert.deepEqual(byTable.transactions.selectedFields.sort(), [
          'advertiserId',
          'revenue',
          'transactionId',
        ]);
        assert.equal(byTable.transactions.selectedFields.includes('adsetId'), false);
      } finally {
        restore();
      }
    });

    it('keeps every unique key in the column list under the day-by-day loop', async () => {
      const restore = suppressStdout();
      try {
        const ctx = createTestContext(
          { Fields: { value: 'statistics advertiserId, statistics clicks' } },
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
          fieldsSchema: {
            statistics: {
              fields: {},
              uniqueKeys: ['advertiserId', 'day', 'categoryId'],
              isTimeSeries: true,
              destinationName: 'statistics',
            },
          },
          parseFields: () => ({ statistics: ['advertiserId', 'clicks'] }),
          // `day` and `categoryId` are injected/returned by the source, never
          // requested -- exactly Criteo's injectDay streams.
          fetchData: async ({ startDate }) => [
            { advertiserId: 'a-1', day: startDate, categoryId: 'c-1', clicks: 3 },
          ],
        });
        const StorageClass = createRecordingStorageClass();

        await new AbstractConnector(ctx, source, StorageClass).run();

        const snapshot = StorageClass.instances[0].initSnapshot;
        const missing = snapshot.uniqueKeyColumns.filter(
          key => !snapshot.selectedFields.includes(key)
        );
        assert.deepEqual(
          missing,
          [],
          `PRIMARY KEY names ${missing.join(', ')} but the CREATE TABLE column list does not`
        );
      } finally {
        restore();
      }
    });

    it('leaves Fields alone for a node whose caller supplies no field list', async () => {
      const restore = suppressStdout();
      try {
        // processFullRefreshNode writes the DISCOVERED field list into Fields
        // itself, then builds the storage. Re-pointing Fields from the (stale,
        // possibly empty) configured selection would undo that.
        const ctx = createTestContext({ Fields: { value: '' } });
        const source = createMockSource({
          fieldsSchema: {
            sheet: {
              fields: { a: { type: 'string' }, b: { type: 'string' } },
              uniqueKeys: ['a'],
              isFullRefresh: true,
              destinationName: 'sheet',
            },
          },
          parseFields: () => ({ sheet: [] }),
          fetchData: async () => [{ a: '1', b: '2' }],
        });
        const StorageClass = createRecordingStorageClass();
        StorageClass.prototype.replaceData = async function replaceData(data) {
          this.replaced = data;
          this.snapshotAtReplace = this.getSelectedFields();
        };

        await new AbstractConnector(ctx, source, StorageClass).run();

        assert.deepEqual(StorageClass.instances[0].snapshotAtReplace, ['a', 'b']);
      } finally {
        restore();
      }
    });
  });
});
