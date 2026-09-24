import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it, vi } from 'vitest';
import { loadGasClass } from '../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourcesDir = path.join(__dirname, '../../src/Sources');

// A `_parsed` column exists only in the destination table. If a source ever sent it to the
// vendor API the request would fail (GAQL maps unknown fields to `undefined`, report APIs
// reject unknown columns), so every source whose schema declares `shortLinks` must strip
// the targets at its fetchData entry.
const sourcesWithShortLinks = fs.readdirSync(sourcesDir).filter(name => {
  const dir = path.join(sourcesDir, name);
  const files = fs.readdirSync(dir, { recursive: true }).map(String);
  return files.some(
    f => f.endsWith('.js') && fs.readFileSync(path.join(dir, f), 'utf8').includes('shortLinks')
  );
});

describe('sources that declare shortLinks strip the targets before calling the vendor API', () => {
  it('covers the six ads connectors', () => {
    expect(sourcesWithShortLinks.sort()).toEqual([
      'FacebookMarketing',
      'GoogleAds',
      'MicrosoftAds',
      'RedditAds',
      'TikTokAds',
      'XAds',
    ]);
  });

  it.each(sourcesWithShortLinks)('%s: fetchData calls omitShortLinkTargets', name => {
    const source = fs.readFileSync(path.join(sourcesDir, name, 'Source.js'), 'utf8');
    const fetchDataBody = source.slice(source.indexOf('async fetchData('));
    expect(fetchDataBody).toContain('omitShortLinkTargets(');
  });
});

describe('GoogleAds fetchData', () => {
  loadGasClass(path.join(__dirname, '../../src/Core/Utils/ShortLinksUtils.js'));
  loadGasClass(path.join(__dirname, '../../src/Core/AbstractSource.js'));
  loadGasClass(path.join(__dirname, '../../src/Sources/GoogleAds/Source.js'));
  const proto = globalThis.GoogleAdsSource.prototype;

  it('never puts a _parsed field into the GAQL query or the request', async () => {
    const self = Object.assign(Object.create(proto), {
      fieldsSchema: {
        ad_group_ads_stats: {
          shortLinks: [{ field: 'ad_final_urls', target: 'ad_final_urls_parsed' }],
        },
      },
      _buildQuery: vi.fn(() => 'SELECT ...'),
      makeRequest: vi.fn(async () => []),
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await proto.fetchData.call(self, 'ad_group_ads_stats', '123', {
      fields: ['ad_id', 'ad_final_urls', 'ad_final_urls_parsed'],
      startDate: new Date('2026-09-01T00:00:00Z'),
    });

    expect(self._buildQuery.mock.calls[0][0].fields).toEqual(['ad_id', 'ad_final_urls']);
    expect(self.makeRequest.mock.calls[0][0].fields).toEqual(['ad_id', 'ad_final_urls']);
  });
});
