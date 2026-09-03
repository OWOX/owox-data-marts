import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { loadGasClass } from '../../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

globalThis.DateUtils = { formatDate: date => date.toISOString().slice(0, 10) };
globalThis.RUN_CONFIG_TYPE = { INCREMENTAL: 'INCREMENTAL', MANUAL_BACKFILL: 'MANUAL_BACKFILL' };
globalThis.ConnectorUtils = { isTimeSeriesNode: schema => schema?.isTimeSeries === true };
globalThis.FormatUtils = {
  parseIds: value => value.split(','),
  parseFields: value => JSON.parse(value),
};

loadGasClass(path.join(__dirname, '../../../src/Sources/LinkedInAds/Connector.js'), {
  AbstractConnector: class {},
});

const connectorProto = globalThis.LinkedInAdsConnector.prototype;

const REPORT_NODE = 'adAnalytics';
const CATALOG_NODE = 'adCampaigns';

const buildConnector = ({
  urns = 'acc1',
  nodes = { [REPORT_NODE]: ['impressions'] },
  runType = 'INCREMENTAL',
  startDate = new Date('2026-08-10T00:00:00Z'),
  daysToFetch = 3,
  fetchData = async () => [{ impressions: 1 }],
  saveData = async () => undefined,
  truncatedAnalyticsDays = {},
} = {}) => {
  const cursorMovedTo = [];
  const fetched = [];
  const requestedRanges = [];
  const warnings = [];

  const self = Object.create(connectorProto);
  self.runConfig = { type: runType };
  self.source = {
    fieldsSchema: {
      [REPORT_NODE]: { isTimeSeries: true },
      [CATALOG_NODE]: { isTimeSeries: false },
    },
    fetchData: async (nodeName, urn, params) => {
      const { startDate: from, endDate: to } = params;
      fetched.push(`${urn}/${nodeName}/${from ? DateUtils.formatDate(from) : 'catalog'}`);
      if (from) requestedRanges.push([DateUtils.formatDate(from), DateUtils.formatDate(to)]);
      return fetchData({ nodeName, urn, date: from });
    },
    truncatedAnalyticsDays,
    buildTruncationWarning: (urn, days) => `${urn} truncated on ${days.join(', ')}`,
  };
  self.getStorageByNode = async () => ({ saveData });
  self.addMissingFieldsToData = data => data;
  self.getStartDateAndDaysToFetch = () => [startDate, daysToFetch];
  self.config = {
    AccountURNs: { value: urns },
    Fields: { value: JSON.stringify(nodes) },
    CreateEmptyTables: { value: false },
    logMessage: () => {},
    addWarningToCurrentStatus: message => warnings.push(message),
    updateLastRequstedDate: date => cursorMovedTo.push(DateUtils.formatDate(new Date(date))),
  };

  return { self, cursorMovedTo, fetched, requestedRanges, warnings };
};

describe('incremental checkpointing', () => {
  it('saves the cursor after each completed day instead of only at the end', async () => {
    const { self, cursorMovedTo } = buildConnector();

    await connectorProto.startImportProcess.call(self);

    expect(cursorMovedTo).toEqual(['2026-08-10', '2026-08-11', '2026-08-12']);
  });

  it('requests every day as a single-day range so no response can span days', async () => {
    const { self, requestedRanges } = buildConnector();

    await connectorProto.startImportProcess.call(self);

    expect(requestedRanges).toEqual([
      ['2026-08-10', '2026-08-10'],
      ['2026-08-11', '2026-08-11'],
      ['2026-08-12', '2026-08-12'],
    ]);
  });

  it('advances days in UTC so a DST switch on the runner cannot shift or repeat a day', async () => {
    // Europe switches to summer time on 2026-03-29; local date arithmetic would land
    // 2026-03-30 at 23:00Z on the 29th and fetch the 29th twice.
    const { self, requestedRanges, cursorMovedTo } = buildConnector({
      startDate: new Date('2026-03-28T00:00:00Z'),
      daysToFetch: 3,
    });

    await connectorProto.startImportProcess.call(self);

    expect(requestedRanges.map(([from]) => from)).toEqual([
      '2026-03-28',
      '2026-03-29',
      '2026-03-30',
    ]);
    expect(cursorMovedTo).toEqual(['2026-03-28', '2026-03-29', '2026-03-30']);
  });

  it('keeps the days already imported when a later day fails', async () => {
    const { self, cursorMovedTo } = buildConnector({
      fetchData: async ({ date }) => {
        if (DateUtils.formatDate(date) === '2026-08-12') throw new Error('Connector died');
        return [{ impressions: 1 }];
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
      urns: 'acc1,acc2',
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
      urns: 'acc1,acc2',
      fetchData: async ({ urn, date }) => {
        if (urn === 'acc2' && DateUtils.formatDate(date) === '2026-08-11') {
          throw new Error('Account acc2 failed');
        }
        return [{ impressions: 1 }];
      },
    });

    await expect(connectorProto.startImportProcess.call(self)).rejects.toThrow(
      'Account acc2 failed'
    );

    expect(cursorMovedTo).toEqual(['2026-08-10']);
  });
});

describe('truncation reporting', () => {
  it('emits one warning per account listing its truncated days after the day loop', async () => {
    const { self, warnings } = buildConnector({
      urns: 'acc1,acc2',
      truncatedAnalyticsDays: { acc1: ['2026-08-10', '2026-08-11'], acc2: ['2026-08-12'] },
    });

    await connectorProto.startImportProcess.call(self);

    expect(warnings).toEqual([
      'acc1 truncated on 2026-08-10, 2026-08-11',
      'acc2 truncated on 2026-08-12',
    ]);
  });

  it('emits no warning when no day reached the element limit', async () => {
    const { self, warnings } = buildConnector();

    await connectorProto.startImportProcess.call(self);

    expect(warnings).toEqual([]);
  });
});

describe('node types', () => {
  it('imports catalog nodes once per account, before any day is requested', async () => {
    const { self, fetched } = buildConnector({
      nodes: { [CATALOG_NODE]: ['id'], [REPORT_NODE]: ['impressions'] },
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
