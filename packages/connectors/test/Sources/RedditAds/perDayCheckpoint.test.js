import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { loadGasClass } from '../../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

globalThis.DateUtils = { formatDate: date => date.toISOString().slice(0, 10) };
globalThis.RUN_CONFIG_TYPE = { INCREMENTAL: 'INCREMENTAL', MANUAL_BACKFILL: 'MANUAL_BACKFILL' };
globalThis.RedditAdsHelper = {
  parseFields: value => JSON.parse(value),
  parseAccountIds: value => value.split(','),
};

loadGasClass(path.join(__dirname, '../../../src/Sources/RedditAds/Connector.js'), {
  AbstractConnector: class {},
});

const connectorProto = globalThis.RedditAdsConnector.prototype;

const REPORT_NODE = 'ad_account_report';
const CATALOG_NODE = 'campaigns';

const buildConnector = ({
  accountIds = 'acc1',
  nodes = { [REPORT_NODE]: ['spend'] },
  runType = 'INCREMENTAL',
  startDate = new Date('2026-08-10T00:00:00Z'),
  daysToFetch = 3,
  fetchData = async () => [{ spend: 1 }],
  saveData = async () => undefined,
} = {}) => {
  const cursorMovedTo = [];
  const fetched = [];

  const self = Object.create(connectorProto);
  self.runConfig = { type: runType };
  self.source = {
    fieldsSchema: {
      [REPORT_NODE]: { isTimeSeries: true },
      [CATALOG_NODE]: { isTimeSeries: false },
    },
    fetchData: async (nodeName, accountId, fields, date) => {
      fetched.push(`${accountId}/${nodeName}/${date ? DateUtils.formatDate(date) : 'catalog'}`);
      return fetchData({ nodeName, accountId, date });
    },
  };
  self.getStorageByNode = async () => ({ saveData });
  self.addMissingFieldsToData = data => data;
  self.getStartDateAndDaysToFetch = () => [startDate, daysToFetch];
  self.config = {
    AccountIDs: { value: accountIds },
    Fields: { value: JSON.stringify(nodes) },
    CreateEmptyTables: { value: false },
    logMessage: () => {},
    updateLastRequstedDate: date => cursorMovedTo.push(new Date(date).toISOString().slice(0, 10)),
  };

  return { self, cursorMovedTo, fetched };
};

describe('incremental checkpointing', () => {
  it('saves the cursor after each completed day instead of only at the end', async () => {
    const { self, cursorMovedTo } = buildConnector();

    await connectorProto.startImportProcess.call(self);

    expect(cursorMovedTo).toEqual(['2026-08-10', '2026-08-11', '2026-08-12']);
  });

  it('keeps the days already imported when a later day fails', async () => {
    const { self, cursorMovedTo } = buildConnector({
      fetchData: async ({ date }) => {
        if (DateUtils.formatDate(date) === '2026-08-12') throw new Error('Connector died');
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
      `acc1/${REPORT_NODE}/2026-08-10`,
      `acc2/${REPORT_NODE}/2026-08-10`,
      `acc1/${REPORT_NODE}/2026-08-11`,
      `acc2/${REPORT_NODE}/2026-08-11`,
    ]);
    expect(cursorMovedTo).toEqual(['2026-08-10', '2026-08-11']);
  });

  it('does not checkpoint a date that only the first account imported', async () => {
    const { self, cursorMovedTo } = buildConnector({
      accountIds: 'acc1,acc2',
      fetchData: async ({ accountId, date }) => {
        if (accountId === 'acc2' && DateUtils.formatDate(date) === '2026-08-11') {
          throw new Error('Account acc2 failed');
        }
        return [{ spend: 1 }];
      },
    });

    await expect(connectorProto.startImportProcess.call(self)).rejects.toThrow(
      'Account acc2 failed'
    );

    expect(cursorMovedTo).toEqual(['2026-08-10']);
  });
});

describe('node types', () => {
  it('imports catalog nodes once per account, before any day is requested', async () => {
    const { self, fetched } = buildConnector({
      nodes: { [CATALOG_NODE]: ['id'], [REPORT_NODE]: ['spend'] },
      daysToFetch: 2,
    });

    await connectorProto.startImportProcess.call(self);

    expect(fetched[0]).toBe(`acc1/${CATALOG_NODE}/catalog`);
    expect(fetched.filter(entry => entry.includes(CATALOG_NODE))).toHaveLength(1);
  });

  it('skips the day loop entirely when only catalog nodes are selected', async () => {
    const { self, cursorMovedTo } = buildConnector({ nodes: { [CATALOG_NODE]: ['id'] } });

    await connectorProto.startImportProcess.call(self);

    expect(cursorMovedTo).toEqual([]);
  });

  it('imports nothing when the range has no days left to fetch', async () => {
    const { self, cursorMovedTo, fetched } = buildConnector({ daysToFetch: 0 });

    await connectorProto.startImportProcess.call(self);

    expect(fetched).toEqual([]);
    expect(cursorMovedTo).toEqual([]);
  });
});
