import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { loadGasClass } from '../../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

globalThis.DateUtils = { formatDate: date => date.toISOString().slice(0, 10) };
globalThis.RUN_CONFIG_TYPE = { INCREMENTAL: 'INCREMENTAL', MANUAL_BACKFILL: 'MANUAL_BACKFILL' };

// Advertiser parsing decides whether the day loop may run at all, and this parser is the
// only one of the four that filters blanks — so use the real helper rather than a stub
// that cannot produce the empty list the connector has to reject.
loadGasClass(path.join(__dirname, '../../../src/Sources/CriteoAds/Helper.js'));

// Fields is configured as a flat "nodeName fieldName, nodeName fieldName" string.
const toFieldsString = nodes =>
  Object.entries(nodes)
    .flatMap(([nodeName, fields]) => fields.map(field => `${nodeName} ${field}`))
    .join(', ');

loadGasClass(path.join(__dirname, '../../../src/Sources/CriteoAds/Connector.js'), {
  AbstractConnector: class {},
});

const connectorProto = globalThis.CriteoAdsConnector.prototype;

const REPORT_NODE = 'statistics';

const buildConnector = ({
  advertiserIds = 'adv1',
  nodes = { [REPORT_NODE]: ['clicks'] },
  runType = 'INCREMENTAL',
  startDate = new Date('2026-08-10T00:00:00Z'),
  daysToFetch = 3,
  fetchData = async () => [{ clicks: 1 }],
  saveData = async () => undefined,
} = {}) => {
  const cursorMovedTo = [];
  const fetched = [];

  const self = Object.create(connectorProto);
  self.runConfig = { type: runType };
  self.source = {
    fieldsSchema: { [REPORT_NODE]: { isTimeSeries: true } },
    fetchData: async params => {
      fetched.push(`${params.accountId}/${params.nodeName}/${DateUtils.formatDate(params.date)}`);
      return fetchData(params);
    },
  };
  self.getStorageByNode = async () => ({ saveData });
  self.addMissingFieldsToData = data => data;
  self.getStartDateAndDaysToFetch = () => [startDate, daysToFetch];
  self.config = {
    AdvertiserIDs: { value: advertiserIds },
    Fields: { value: toFieldsString(nodes) },
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
        return [{ clicks: 1 }];
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

  it('advances the cursor on a day that returned no rows', async () => {
    const { self, cursorMovedTo } = buildConnector({ fetchData: async () => [] });

    await connectorProto.startImportProcess.call(self);

    expect(cursorMovedTo).toEqual(['2026-08-10', '2026-08-11', '2026-08-12']);
  });
});

describe('multiple advertisers', () => {
  it('completes a date for every advertiser before moving the cursor', async () => {
    const { self, cursorMovedTo, fetched } = buildConnector({
      advertiserIds: 'adv1,adv2',
      daysToFetch: 2,
    });

    await connectorProto.startImportProcess.call(self);

    expect(fetched).toEqual([
      `adv1/${REPORT_NODE}/2026-08-10`,
      `adv2/${REPORT_NODE}/2026-08-10`,
      `adv1/${REPORT_NODE}/2026-08-11`,
      `adv2/${REPORT_NODE}/2026-08-11`,
    ]);
    expect(cursorMovedTo).toEqual(['2026-08-10', '2026-08-11']);
  });

  it('does not checkpoint a date that only the first advertiser imported', async () => {
    const { self, cursorMovedTo } = buildConnector({
      advertiserIds: 'adv1,adv2',
      fetchData: async ({ accountId, date }) => {
        if (accountId === 'adv2' && DateUtils.formatDate(date) === '2026-08-11') {
          throw new Error('Advertiser adv2 failed');
        }
        return [{ clicks: 1 }];
      },
    });

    await expect(connectorProto.startImportProcess.call(self)).rejects.toThrow(
      'Advertiser adv2 failed'
    );

    expect(cursorMovedTo).toEqual(['2026-08-10']);
  });
});

describe('empty configurations', () => {
  it('refuses to run when AdvertiserIDs holds no usable id', async () => {
    // ";" is truthy so it passes required-field validation, but this parser filters blanks
    // to an empty list. Advancing the cursor over days nothing was fetched for would mark
    // them imported for good, once the lookback window has passed.
    const { self, cursorMovedTo, fetched } = buildConnector({ advertiserIds: '; ,' });

    await expect(connectorProto.startImportProcess.call(self)).rejects.toThrow(
      /No valid Advertiser IDs/
    );

    expect(fetched).toEqual([]);
    expect(cursorMovedTo).toEqual([]);
  });

  it('refuses to run a node that is not a time series', async () => {
    const { self, cursorMovedTo, fetched } = buildConnector({ nodes: { campaigns: ['id'] } });
    self.source.fieldsSchema.campaigns = { isTimeSeries: false };

    await expect(connectorProto.startImportProcess.call(self)).rejects.toThrow(
      /Only time series nodes are supported. Unsupported: campaigns/
    );

    expect(fetched).toEqual([]);
    expect(cursorMovedTo).toEqual([]);
  });

  it('imports nothing when no node is selected', async () => {
    const { self, cursorMovedTo, fetched } = buildConnector({ nodes: {} });

    await connectorProto.startImportProcess.call(self);

    expect(fetched).toEqual([]);
    expect(cursorMovedTo).toEqual([]);
  });

  it('imports nothing when the range has no days left to fetch', async () => {
    const { self, cursorMovedTo, fetched } = buildConnector({ daysToFetch: 0 });

    await connectorProto.startImportProcess.call(self);

    expect(fetched).toEqual([]);
    expect(cursorMovedTo).toEqual([]);
  });
});
