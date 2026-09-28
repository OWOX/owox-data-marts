import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { loadGasClass } from '../../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

globalThis.DateUtils = { formatDate: date => date.toISOString().slice(0, 10) };
globalThis.RUN_CONFIG_TYPE = { INCREMENTAL: 'INCREMENTAL', MANUAL_BACKFILL: 'MANUAL_BACKFILL' };

loadGasClass(path.join(__dirname, '../../../src/Sources/Shopify/Connector.js'), {
  AbstractConnector: class {},
});

const connectorProto = globalThis.ShopifyConnector.prototype;

const buildConnector = ({ runType = 'INCREMENTAL', daysToFetch = 3 } = {}) => {
  const cursorMovedTo = [];

  const self = Object.create(connectorProto);
  self.runConfig = { type: runType };
  self.source = { fetchData: async () => [{ id: 1 }] };
  self.getStorageByNode = async () => ({ saveData: async () => undefined });
  self.addMissingFieldsToData = data => data;
  self.getStartDateAndDaysToFetch = () => [new Date('2026-08-10T00:00:00Z'), daysToFetch];
  self.config = {
    CreateEmptyTables: { value: false },
    logMessage: () => {},
    updateLastRequstedDate: date => cursorMovedTo.push(new Date(date).toISOString().slice(0, 10)),
  };

  return { self, cursorMovedTo };
};

describe('Shopify checkpointing', () => {
  it('moves the incremental cursor after each completed day', async () => {
    const { self, cursorMovedTo } = buildConnector();

    await connectorProto._processTimeSeriesNode.call(self, { nodeName: 'orders', fields: ['id'] });

    expect(cursorMovedTo).toEqual(['2026-08-10', '2026-08-11', '2026-08-12']);
  });

  it('records no progress during a manual backfill', async () => {
    // Deliberately unlike the other per-day connectors. Shopify runs this whole date loop per
    // node, with the node loop outside it, so a date finished for `orders` says nothing about
    // `customers`. Reporting it would let a resumed backfill skip days a later node never
    // imported. Delete this test only together with a move to a date-outer loop.
    const { self, cursorMovedTo } = buildConnector({ runType: 'MANUAL_BACKFILL' });

    await connectorProto._processTimeSeriesNode.call(self, { nodeName: 'orders', fields: ['id'] });

    expect(cursorMovedTo).toEqual([]);
  });
});
