import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it, vi } from 'vitest';
import { loadGasClass } from '../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// AbstractConnector only references AbstractStorage/AbstractRunConfig inside the
// constructor, so loading the real constants file is enough to exercise the
// date-range method on the prototype without instantiating anything.
loadGasClass(path.join(__dirname, '../../src/Constants/CommonConstants.js'));
loadGasClass(path.join(__dirname, '../../src/Core/Utils/ShortLinksUtils.js'));
loadGasClass(path.join(__dirname, '../../src/Core/AbstractConnector.js'));
const proto = globalThis.AbstractConnector.prototype;

const rangeFor = (start, end) =>
  proto._getManualBackfillDateRange.call({
    config: {
      StartDate: { value: new Date(start) },
      EndDate: { value: new Date(end) },
      logMessage: () => {},
    },
  });

describe('_getManualBackfillDateRange', () => {
  it('accepts a full 31-day calendar month as one run', () => {
    const [startDate, daysToFetch] = rangeFor('2026-07-01', '2026-07-31');

    expect(startDate.toISOString().slice(0, 10)).toBe('2026-07-01');
    expect(daysToFetch).toBe(31);
  });

  it('rejects a range longer than MAX_MANUAL_BACKFILL_DAYS', () => {
    expect(() => rangeFor('2026-07-01', '2026-08-01')).toThrow(
      'Manual backfill is limited to 31 days per run (requested 32 days)'
    );
  });
});

describe('short link resolution hook', () => {
  const NOW = Date.now();
  const SEEDED = 'https://short.example/seeded';
  const specs = [{ field: 'click_url', target: 'click_url_parsed' }];

  function buildConnector({ shortLinks, processShortLinks = true, nodeSpecs = specs } = {}) {
    // pass nodeSpecs: null to model a node without a spec
    const connector = Object.assign(Object.create(proto), {
      runConfig: { state: shortLinks ? { shortLinks } : {} },
      source: { fieldsSchema: { ads: { shortLinks: nodeSpecs } } },
      config: {
        ProcessShortLinks: { value: processShortLinks },
        updateState: vi.fn(),
        logMessage: vi.fn(),
      },
    });
    proto._initShortLinksCache.call(connector);
    return connector;
  }

  it('seeds the cache from persisted state so a known link is not fetched again', async () => {
    globalThis.HttpUtils = { fetch: vi.fn() };
    const connector = buildConnector({
      shortLinks: { [SEEDED]: ['https://example.com/seeded', NOW] },
    });

    const result = await connector.resolveShortLinks(
      'ads',
      [{ click_url: SEEDED }],
      ['click_url', 'click_url_parsed']
    );

    expect(globalThis.HttpUtils.fetch).not.toHaveBeenCalled();
    expect(result[0].click_url_parsed).toBe('https://example.com/seeded');
  });

  it('does nothing without a spec, with the toggle off, or when field or target is not selected', async () => {
    const data = [{ click_url: 'https://short.example/abc123' }];
    const both = ['click_url', 'click_url_parsed'];

    expect(await buildConnector({ nodeSpecs: null }).resolveShortLinks('ads', data, both)).toBe(
      data
    );
    expect(
      await buildConnector({ processShortLinks: false }).resolveShortLinks('ads', data, both)
    ).toBe(data);
    expect(await buildConnector().resolveShortLinks('other', data, both)).toBe(data);
    // target without its source field: nothing to resolve from
    expect(await buildConnector().resolveShortLinks('ads', data, ['click_url_parsed'])).toBe(data);
    // source field without the target: the user did not ask for the column
    expect(await buildConnector().resolveShortLinks('ads', data, ['click_url'])).toBe(data);
  });

  it('persists new resolutions once and keeps the original resolution time of seeded ones', () => {
    const connector = buildConnector({
      shortLinks: { [SEEDED]: ['https://example.com/seeded', NOW - 1000] },
    });
    connector._shortLinksCache.set('https://short.example/new', 'https://example.com/new');
    connector._shortLinksCache.set('https://short.example/failed', 'https://short.example/failed');

    connector._flushShortLinksState();

    expect(connector.config.updateState).toHaveBeenCalledTimes(1);
    const { shortLinks } = connector.config.updateState.mock.calls[0][0];
    expect(shortLinks[SEEDED]).toEqual(['https://example.com/seeded', NOW - 1000]);
    expect(shortLinks['https://short.example/new'][0]).toBe('https://example.com/new');
    expect(shortLinks['https://short.example/failed']).toBeUndefined();
  });

  it('does not emit state when nothing new was resolved', () => {
    const connector = buildConnector({
      shortLinks: { [SEEDED]: ['https://example.com/seeded', NOW] },
    });
    connector._shortLinksCache.set('https://short.example/failed', 'https://short.example/failed');

    connector._flushShortLinksState();

    expect(connector.config.updateState).not.toHaveBeenCalled();
  });
});
