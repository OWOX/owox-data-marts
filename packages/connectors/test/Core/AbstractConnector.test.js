import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadGasClass } from '../support/loadGasClass.js';
import { AbstractConnector } from '../../src/Core/AbstractConnector.js';
import { RUN_CONFIG_TYPE } from '../../src/Constants/CommonConstants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The short link helpers are bare globals of the bundle's scope.
loadGasClass(path.join(__dirname, '../../src/Core/Utils/ShortLinksUtils.js'));

// The date-range methods read only the run config and the logger, so they can be exercised
// on the prototype without constructing a connector (which would want a source and a
// storage class). Built on the real prototype so the date helpers they call run for real.
const rangeFor = (start, end) =>
  Object.assign(Object.create(AbstractConnector.prototype), {
    context: {
      runConfig: {
        type: RUN_CONFIG_TYPE.MANUAL_BACKFILL,
        data: [
          { configField: 'StartDate', value: start },
          { configField: 'EndDate', value: end },
        ],
      },
      log: () => {},
    },
  })._getManualBackfillDateRange();

describe('_getManualBackfillDateRange', () => {
  it('accepts a full 31-day calendar month as one run', () => {
    const range = rangeFor('2026-07-01', '2026-07-31');

    expect(range.startDate).toBe('2026-07-01');
    expect(range.endDate).toBe('2026-07-31');
  });

  /**
   * The cap is a last line of defence, not the primary one: the backend refuses a longer
   * range before the run is created. It matters here because a day-by-day node issues one
   * request per account per day, so a range that slipped past the backend — over MCP, or
   * through `owox-ctl` — holds a concurrency slot for hours before anything notices.
   */
  it('rejects a range longer than MAX_MANUAL_BACKFILL_DAYS', () => {
    expect(() => rangeFor('2026-07-01', '2026-08-01')).toThrow(
      'Manual backfill is limited to 31 days per run (requested 32 days)'
    );
  });
});

describe('short link resolution hook', () => {
  const NOW = Date.now();
  const SEEDED = 'https://short.example/seeded';
  const LANDING = 'https://example.com/landing';
  const specs = [{ field: 'click_url', target: 'click_url_parsed' }];
  const both = ['click_url', 'click_url_parsed'];

  // Native fetch responses: under `redirect: 'manual'` Node hands back the 3xx itself.
  const redirectTo = location => new Response(null, { status: 302, headers: { location } });
  const finalPage = () => new Response(null, { status: 200 });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  // Pass nodeSpecs: null to model a node without a spec.
  function buildConnector({
    shortLinks,
    processShortLinks = true,
    nodeSpecs = specs,
    params,
  } = {}) {
    const values = { ProcessShortLinks: processShortLinks, ...params };
    return Object.assign(Object.create(AbstractConnector.prototype), {
      context: {
        runConfig: { state: shortLinks ? { shortLinks } : {} },
        getParameter: name => (name in values ? { value: values[name] } : undefined),
        updateState: vi.fn(),
        log: vi.fn(),
      },
      source: { fieldsSchema: { ads: { shortLinks: nodeSpecs } } },
    });
  }

  it('seeds the cache from persisted state so a known link is not fetched again', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const connector = buildConnector({
      shortLinks: { [SEEDED]: [LANDING, NOW] },
      params: { ShortLinkDomains: 'short.example' },
    });

    const result = await connector.resolveShortLinks('ads', [{ click_url: SEEDED }], both);

    expect(fetch).not.toHaveBeenCalled();
    expect(result[0].click_url_parsed).toBe(LANDING);
  });

  it('still honors domains saved by the former Short Link Domains setting', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async url => (url === LANDING ? finalPage() : redirectTo(LANDING)))
    );
    const connector = buildConnector({ params: { ShortLinkDomains: 'short.example' } });

    const result = await connector.resolveShortLinks(
      'ads',
      [{ click_url: 'https://short.example/a/b' }],
      both
    );

    expect(result[0].click_url_parsed).toBe(LANDING);
  });

  it('allowlists the domains in CONNECTOR_SHORT_LINK_DOMAINS', async () => {
    vi.stubEnv('CONNECTOR_SHORT_LINK_DOMAINS', 'short.example');
    vi.stubGlobal(
      'fetch',
      vi.fn(async url => (url === LANDING ? finalPage() : redirectTo(LANDING)))
    );
    const connector = buildConnector();

    const result = await connector.resolveShortLinks(
      'ads',
      [{ click_url: 'https://short.example/abc123' }],
      both
    );

    expect(result[0].click_url_parsed).toBe(LANDING);
  });

  it('does not apply a saved answer for a link whose domain is no longer allowlisted', async () => {
    vi.stubGlobal('fetch', vi.fn());
    // Saved by an earlier run, when one-part links resolved on any domain
    const connector = buildConnector({ shortLinks: { [SEEDED]: [LANDING, NOW] } });

    const result = await connector.resolveShortLinks('ads', [{ click_url: SEEDED }], both);

    expect(fetch).not.toHaveBeenCalled();
    expect(result[0].click_url_parsed).toBe(SEEDED);
  });

  it('resolves links on built-in short link services with no configuration at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async url => (url === LANDING ? finalPage() : redirectTo(LANDING)))
    );
    const connector = buildConnector();

    const result = await connector.resolveShortLinks(
      'ads',
      [{ click_url: 'https://bit.ly/abc123' }],
      both
    );

    expect(result[0].click_url_parsed).toBe(LANDING);
  });

  it('does nothing without a spec, with the toggle off, or when field or target is not selected', async () => {
    const data = [{ click_url: 'https://short.example/abc123' }];

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

  it('persists answered requests, including landing pages, and keeps seeded resolution times', () => {
    const connector = buildConnector({ shortLinks: { [SEEDED]: [LANDING, NOW - 1000] } });
    const cache = connector._shortLinksCache();
    cache.resolved.set('https://short.example/new', 'https://example.com/new');
    cache.resolved.set('https://brand.example/sale', 'https://brand.example/sale');
    cache.resolved.set('https://short.example/failed', 'https://short.example/failed');
    cache.failed.add('https://short.example/failed');

    connector._flushShortLinksState();

    expect(connector.context.updateState).toHaveBeenCalledTimes(1);
    const { shortLinks } = connector.context.updateState.mock.calls[0][0];
    expect(shortLinks[SEEDED]).toEqual([LANDING, NOW - 1000]);
    expect(shortLinks['https://short.example/new'][0]).toBe('https://example.com/new');
    // A landing page that answered without a redirect is remembered compactly
    expect(shortLinks['https://brand.example/sale'][0]).toBeNull();
    // A failed request is retried by the next run, so it is not persisted
    expect(shortLinks['https://short.example/failed']).toBeUndefined();
  });

  it('does not emit state when only failed requests are new, or when no node resolved links', () => {
    const connector = buildConnector({ shortLinks: { [SEEDED]: [LANDING, NOW] } });
    const cache = connector._shortLinksCache();
    cache.resolved.set('https://short.example/failed', 'https://short.example/failed');
    cache.failed.add('https://short.example/failed');
    connector._flushShortLinksState();

    const untouched = buildConnector();
    untouched._flushShortLinksState();

    expect(connector.context.updateState).not.toHaveBeenCalled();
    expect(untouched.context.updateState).not.toHaveBeenCalled();
  });

  it('does not request a landing page that a previous run already checked', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const connector = buildConnector({
      shortLinks: { 'https://brand.example/sale': [null, NOW] },
      params: { ShortLinkDomains: 'brand.example' },
    });

    const result = await connector.resolveShortLinks(
      'ads',
      [{ click_url: 'https://brand.example/sale' }],
      both
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(result[0].click_url_parsed).toBe('https://brand.example/sale');
  });

  // main resolved in every connector's save calls; here every write goes through _writeBatch,
  // catalog pages included.
  it('resolves each batch before the storage saves it', async () => {
    const connector = buildConnector({
      shortLinks: { [SEEDED]: [LANDING, NOW] },
      params: { ShortLinkDomains: 'short.example' },
    });
    const saved = [];
    const writer = {
      nodeName: 'ads',
      initialized: false,
      storage: { init: async () => {}, saveData: async rows => saved.push(rows) },
    };

    await connector._writeBatch(writer, [{ click_url: SEEDED }], both);
    await connector._writeBatch(writer, [{ click_url: SEEDED }], both);

    expect(saved).toEqual([
      [{ click_url: SEEDED, click_url_parsed: LANDING }],
      [{ click_url: SEEDED, click_url_parsed: LANDING }],
    ]);
  });
});
