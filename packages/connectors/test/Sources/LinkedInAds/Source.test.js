import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it, vi } from 'vitest';
import { loadGasClass } from '../../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

globalThis.CONFIG_ATTRIBUTES = new Proxy({}, { get: () => 'attr' });
globalThis.OAUTH_CONSTANTS = new Proxy({}, { get: () => 'oauth' });
globalThis.HttpUtils = { fetch: vi.fn() };
globalThis.LinkedInAdsFieldsSchema = {};

loadGasClass(path.join(__dirname, '../../../src/Sources/LinkedInAds/Source.js'), {
  AbstractSource: class {},
});

const sourceProto = globalThis.LinkedInAdsSource.prototype;
const URN = '123456';

const buildSource = ({ makeRequest } = {}) => {
  const warnings = [];
  const self = new globalThis.LinkedInAdsSource({ mergeParameters: params => params });
  self.config = { addWarningToCurrentStatus: message => warnings.push(message) };
  self.makeRequest = makeRequest;

  return { self, warnings };
};

describe('fetchAdAnalytics', () => {
  it('requests one day at a time so each response stays under the API element limit', async () => {
    const requestedUrls = [];
    const { self, warnings } = buildSource({
      makeRequest: vi.fn(async url => {
        requestedUrls.push(url);
        return { elements: [] };
      }),
    });

    await sourceProto.fetchAdAnalytics.call(self, URN, {
      startDate: new Date(2026, 7, 1),
      endDate: new Date(2026, 7, 3),
      fields: ['impressions'],
    });

    expect(requestedUrls).toHaveLength(3);
    expect(requestedUrls[0]).toContain(
      'dateRange=(start:(year:2026,month:8,day:1),end:(year:2026,month:8,day:1))'
    );
    expect(requestedUrls[1]).toContain(
      'dateRange=(start:(year:2026,month:8,day:2),end:(year:2026,month:8,day:2))'
    );
    expect(requestedUrls[2]).toContain(
      'dateRange=(start:(year:2026,month:8,day:3),end:(year:2026,month:8,day:3))'
    );
    expect(warnings).toHaveLength(0);
  });

  it('merges field chunks across the per-day requests', async () => {
    const { self } = buildSource({
      makeRequest: vi.fn(async url => ({
        elements: [
          {
            dateRange: {
              start: { year: 2026, month: 8, day: 1 },
              end: { year: 2026, month: 8, day: 1 },
            },
            pivotValues: ['creative'],
            ...(url.includes('impressions') ? { impressions: 10 } : { clicks: 5 }),
          },
        ],
      })),
    });
    self.MAX_FIELDS_PER_REQUEST = 3;

    const data = await sourceProto.fetchAdAnalytics.call(self, URN, {
      startDate: new Date(2026, 7, 1),
      endDate: new Date(2026, 7, 1),
      fields: ['impressions', 'clicks'],
    });

    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      impressions: 10,
      clicks: 5,
      dateRangeStart: '2026-08-01',
      dateRangeEnd: '2026-08-01',
    });
  });

  it('warns when a day response reaches the API element limit', async () => {
    const { self, warnings } = buildSource({
      makeRequest: vi.fn(async () => ({
        elements: Array.from({ length: 15000 }, (_, i) => ({
          dateRange: {
            start: { year: 2026, month: 8, day: 1 },
            end: { year: 2026, month: 8, day: 1 },
          },
          pivotValues: [String(i)],
        })),
      })),
    });

    await sourceProto.fetchAdAnalytics.call(self, URN, {
      startDate: new Date(2026, 7, 1),
      endDate: new Date(2026, 7, 1),
      fields: ['impressions'],
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('15000');
    expect(warnings[0]).toContain(URN);
  });
});
