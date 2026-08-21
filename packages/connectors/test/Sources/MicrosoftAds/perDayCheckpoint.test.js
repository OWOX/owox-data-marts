import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { loadGasClass } from '../../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

globalThis.DateUtils = { formatDate: date => date.toISOString().slice(0, 10) };
globalThis.RUN_CONFIG_TYPE = { INCREMENTAL: 'INCREMENTAL', MANUAL_BACKFILL: 'MANUAL_BACKFILL' };
globalThis.MicrosoftAdsHelper = { parseFields: value => JSON.parse(value) };

// Account parsing decides whether the day loop runs at all, so use the real helper
// rather than a stub that can never return the empty list the connector must reject.
loadGasClass(path.join(__dirname, '../../../src/Core/Utils/FormatUtils.js'));

loadGasClass(path.join(__dirname, '../../../src/Sources/MicrosoftAds/Connector.js'), {
  AbstractConnector: class {},
});

const connectorProto = globalThis.MicrosoftAdsConnector.prototype;

const REPORT_NODE = 'user_location_performance_report';
const CATALOG_NODE = 'campaigns';

const buildConnector = ({
  accountIds = '2603235',
  nodes = { [REPORT_NODE]: ['Spend'] },
  runType = 'INCREMENTAL',
  startDate = new Date('2026-08-10T00:00:00Z'),
  daysToFetch = 3,
  fetchData = async () => [{ Spend: 1 }],
  saveData = async () => undefined,
} = {}) => {
  const cursorMovedTo = [];
  const fetched = [];
  const logs = [];

  const self = Object.create(connectorProto);
  self.runConfig = { type: runType };
  self.source = {
    fieldsSchema: {
      [REPORT_NODE]: { isTimeSeries: true },
      [CATALOG_NODE]: { isTimeSeries: false },
    },
    fetchData: async params => {
      fetched.push(`${params.accountId}/${params.nodeName}/${params.start_time}`);
      return fetchData(params);
    },
  };
  self.getStorageByNode = async () => ({ saveData });
  self.addMissingFieldsToData = data => data;
  self.getStartDateAndDaysToFetch = () => [startDate, daysToFetch];
  self.config = {
    AccountIDs: { value: accountIds },
    Fields: { value: JSON.stringify(nodes) },
    CreateEmptyTables: { value: false },
    logMessage: message => logs.push(message),
    updateLastRequstedDate: date => cursorMovedTo.push(new Date(date).toISOString().slice(0, 10)),
  };

  return { self, cursorMovedTo, fetched, logs };
};

describe('incremental checkpointing', () => {
  it('saves the cursor after each completed day instead of only at the end', async () => {
    // A run that only checkpoints at the end loses all progress when the process dies,
    // and the interrupted-run sweep then restarts the whole range — forever.
    const { self, cursorMovedTo } = buildConnector();

    await connectorProto.startImportProcess.call(self);

    expect(cursorMovedTo).toEqual(['2026-08-10', '2026-08-11', '2026-08-12']);
  });

  it('keeps the days already imported when a later day fails', async () => {
    const { self, cursorMovedTo } = buildConnector({
      fetchData: async ({ start_time }) => {
        if (start_time === '2026-08-12') throw new Error('Connector process died');
        return [{ Spend: 1 }];
      },
    });

    await expect(connectorProto.startImportProcess.call(self)).rejects.toThrow(
      'Connector process died'
    );

    expect(cursorMovedTo).toEqual(['2026-08-10', '2026-08-11']);
  });

  it('does not move the cursor past a day whose storage write failed', async () => {
    // Advancing here would leave a permanent gap: once ReimportLookbackWindow passes,
    // that day is never requested again.
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

  it('advances the cursor on a day that returned no rows', async () => {
    // A quiet day must not stall the cursor, otherwise the run never reaches today.
    const { self, cursorMovedTo } = buildConnector({ fetchData: async () => [] });

    await connectorProto.startImportProcess.call(self);

    expect(cursorMovedTo).toEqual(['2026-08-10', '2026-08-11', '2026-08-12']);
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
    // The account-outer loop this replaced could advance the cursor past days a later
    // account never loaded, silently dropping that account's data.
    const { self, cursorMovedTo } = buildConnector({
      accountIds: 'acc1,acc2',
      fetchData: async ({ accountId, start_time }) => {
        if (accountId === 'acc2' && start_time === '2026-08-11') {
          throw new Error('Account acc2 failed');
        }
        return [{ Spend: 1 }];
      },
    });

    await expect(connectorProto.startImportProcess.call(self)).rejects.toThrow(
      'Account acc2 failed'
    );

    expect(cursorMovedTo).toEqual(['2026-08-10']);
  });

  it('trims whitespace and accepts semicolons in configured account IDs', async () => {
    // Whitespace before a delimiter is not eaten by the split, so an untrimmed id would
    // reach the API as " acc1 " and fetch nothing.
    const { self, fetched } = buildConnector({
      accountIds: ' acc1 ; acc2 ',
      daysToFetch: 1,
    });

    await connectorProto.startImportProcess.call(self);

    expect(fetched).toEqual([`acc1/${REPORT_NODE}/2026-08-10`, `acc2/${REPORT_NODE}/2026-08-10`]);
  });

  it('refuses to run when AccountIDs holds no usable id', async () => {
    // "," is truthy so it passes required-field validation, but parses to an empty list.
    // Importing nothing while advancing the cursor would skip every one of those days
    // for good once the config is corrected.
    const { self, cursorMovedTo, fetched } = buildConnector({ accountIds: ', ;' });

    await expect(connectorProto.startImportProcess.call(self)).rejects.toThrow(
      /No valid Account IDs/
    );

    expect(fetched).toEqual([]);
    expect(cursorMovedTo).toEqual([]);
  });
});

describe('node types', () => {
  it('imports catalog nodes once per account, before any day is requested', async () => {
    const { self, fetched } = buildConnector({
      nodes: { [CATALOG_NODE]: ['Id'], [REPORT_NODE]: ['Spend'] },
      daysToFetch: 2,
    });

    await connectorProto.startImportProcess.call(self);

    expect(fetched[0]).toBe(`2603235/${CATALOG_NODE}/undefined`);
    expect(fetched.filter(entry => entry.includes(CATALOG_NODE))).toHaveLength(1);
  });

  it('completes both time series nodes for a date before checkpointing it', async () => {
    const secondReport = 'ad_performance_report';
    const { self, cursorMovedTo, fetched } = buildConnector({
      nodes: { [REPORT_NODE]: ['Spend'], [secondReport]: ['Clicks'] },
      daysToFetch: 1,
    });
    self.source.fieldsSchema[secondReport] = { isTimeSeries: true };

    await connectorProto.startImportProcess.call(self);

    expect(fetched).toEqual([
      `2603235/${REPORT_NODE}/2026-08-10`,
      `2603235/${secondReport}/2026-08-10`,
    ]);
    expect(cursorMovedTo).toEqual(['2026-08-10']);
  });

  it('skips the day loop entirely when only catalog nodes are selected', async () => {
    const { self, cursorMovedTo } = buildConnector({ nodes: { [CATALOG_NODE]: ['Id'] } });

    await connectorProto.startImportProcess.call(self);

    expect(cursorMovedTo).toEqual([]);
  });

  it('imports nothing when the range has no days left to fetch', async () => {
    const { self, cursorMovedTo, fetched } = buildConnector({ daysToFetch: 0 });

    await connectorProto.startImportProcess.call(self);

    expect(fetched).toEqual([]);
    expect(cursorMovedTo).toEqual([]);
  });

  it('names the offending node when Fields references one the source dropped', async () => {
    // Otherwise the run dies on a bare property-of-undefined before the first log line,
    // leaving nothing in run history to diagnose it from.
    const { self, fetched } = buildConnector({ nodes: { removed_report: ['Spend'] } });

    await expect(connectorProto.startImportProcess.call(self)).rejects.toThrow(
      /Unknown node 'removed_report'/
    );

    expect(fetched).toEqual([]);
  });

  it('writes an empty day when CreateEmptyTables is on', async () => {
    const saved = [];
    const { self } = buildConnector({
      daysToFetch: 2,
      fetchData: async () => [],
      saveData: async rows => saved.push(rows),
    });
    self.config.CreateEmptyTables = { value: true };

    await connectorProto.startImportProcess.call(self);

    expect(saved).toEqual([[], []]);
  });

  it('does not touch storage on an empty day when CreateEmptyTables is off', async () => {
    const saved = [];
    const { self } = buildConnector({
      daysToFetch: 2,
      fetchData: async () => [],
      saveData: async rows => saved.push(rows),
    });

    await connectorProto.startImportProcess.call(self);

    expect(saved).toEqual([]);
  });
});
