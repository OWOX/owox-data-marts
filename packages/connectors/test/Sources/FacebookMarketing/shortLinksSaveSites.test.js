import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it, vi } from 'vitest';
import { loadGasClass } from '../../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

globalThis.DateUtils = { formatDate: date => date.toISOString().slice(0, 10) };
globalThis.RUN_CONFIG_TYPE = { INCREMENTAL: 'INCREMENTAL' };

loadGasClass(path.join(__dirname, '../../../src/Sources/FacebookMarketing/Connector.js'), {
  AbstractConnector: class {
    // Short link hook lives on the real base class; pass records through here
    async resolveShortLinks(_nodeName, data) {
      return data;
    }
  },
});

const connectorProto = globalThis.FacebookMarketingConnector.prototype;
const RESOLVED = [{ resolved: true }];

function buildConnector(fetchData) {
  const saved = [];
  const self = Object.create(connectorProto);
  self.skippedAccounts = new Map();
  self.runConfig = { type: 'INCREMENTAL' };
  self.source = { fetchData };
  self.getStorageByNode = async () => ({ saveData: async data => saved.push(data) });
  self.resolveShortLinks = vi.fn(async () => RESOLVED);
  self.config = {
    logMessage: () => {},
    logError: () => {},
    addWarningToCurrentStatus: () => {},
    CreateEmptyTables: { value: false },
    updateLastRequstedDate: () => {},
  };
  return { self, saved };
}

describe('short link resolution runs before every save', () => {
  it('time-series rows pass through resolveShortLinks with the node fields', async () => {
    const rows = [{ ad_id: '1', link_url_asset: { website_url: 'https://short.example/a/b' } }];
    const fields = ['ad_id', 'link_url_asset'];
    const { self, saved } = buildConnector(async () => rows);

    await connectorProto.startImportProcessOfTimeSeriesData.call(
      self,
      ['1'],
      { 'ad-account/insights-by-link-url-asset': fields },
      new Date('2026-08-05T00:00:00Z'),
      1
    );

    expect(self.resolveShortLinks).toHaveBeenCalledWith(
      'ad-account/insights-by-link-url-asset',
      rows,
      fields
    );
    expect(saved).toEqual([RESOLVED]);
  });

  it('every catalog page passes through resolveShortLinks before it is saved', async () => {
    const page = [{ id: '1', object_url: 'https://short.example/abc' }];
    const fields = ['id', 'object_url', 'object_url_parsed'];
    const { self, saved } = buildConnector(async (_node, _account, _fields, _start, onPage) => {
      await onPage(page);
      await onPage(page);
    });

    await connectorProto.startImportProcessOfCatalogData.call(
      self,
      'ad-account/adcreatives',
      ['1'],
      fields
    );

    expect(self.resolveShortLinks).toHaveBeenCalledTimes(2);
    expect(self.resolveShortLinks).toHaveBeenCalledWith('ad-account/adcreatives', page, fields);
    expect(saved).toEqual([RESOLVED, RESOLVED]);
  });
});
