import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { loadGasClass } from '../../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

globalThis.DateUtils = { formatDate: date => date.toISOString().slice(0, 10) };
globalThis.RUN_CONFIG_TYPE = { INCREMENTAL: 'INCREMENTAL', MANUAL_BACKFILL: 'MANUAL_BACKFILL' };

loadGasClass(path.join(__dirname, '../../../src/Sources/TikTokAds/Connector.js'), {
  AbstractConnector: class {},
});

const connectorProto = globalThis.TikTokAdsConnector.prototype;

const buildConnector = ({ runType = 'INCREMENTAL', fetchData = async () => [{ id: 1 }] } = {}) => {
  const cursorMovedTo = [];

  const self = Object.create(connectorProto);
  self.runConfig = { type: runType };
  self.source = { fetchData };
  self.getStorageByNode = async () => ({ saveData: async () => undefined });
  self.addMissingFieldsToData = data => data;
  self.advertiserSuccesses = new Map();
  self._logFailure = () => {};
  self._trackAdvertiserError = () => {};
  self.config = {
    CreateEmptyTables: { value: false },
    logMessage: () => {},
    updateLastRequstedDate: date => cursorMovedTo.push(new Date(date).toISOString().slice(0, 10)),
  };

  return { self, cursorMovedTo };
};

const run = (self, days = 3) =>
  connectorProto.startImportProcessOfTimeSeriesData.call(
    self,
    ['adv1'],
    { campaign: ['spend'] },
    new Date('2026-08-10T00:00:00Z'),
    days
  );

describe('TikTokAds checkpointing', () => {
  it('moves the incremental cursor after each date', async () => {
    const { self, cursorMovedTo } = buildConnector();

    await run(self);

    expect(cursorMovedTo).toEqual(['2026-08-10', '2026-08-11', '2026-08-12']);
  });

  it('records no progress during a manual backfill', async () => {
    // Deliberately unlike the other date-outer connectors. This loop swallows every fetch and
    // storage error, transient ones included, and reports them only after the whole range has
    // been walked, so a date that imported nothing still reaches the checkpoint below. Letting
    // a backfill record that would make a resumed run skip the date for good.
    const { self, cursorMovedTo } = buildConnector({
      runType: 'MANUAL_BACKFILL',
      fetchData: async () => {
        throw new Error('TikTok API is down');
      },
    });

    await run(self);

    expect(cursorMovedTo).toEqual([]);
  });
});
