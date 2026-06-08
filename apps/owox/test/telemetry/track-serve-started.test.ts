import { expect } from 'chai';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { trackServeStarted } from '../../src/telemetry/track-serve-started.js';

describe('trackServeStarted', () => {
  let fetchCalls: number;
  let originalFetch: typeof globalThis.fetch;
  let dataDir: string;

  beforeEach(() => {
    // Hermetic anonymous-id store: keep telemetry.json out of the real OS app-data dir.
    dataDir = mkdtempSync(join(tmpdir(), 'owox-telemetry-test-'));
    fetchCalls = 0;
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      return { ok: true } as Response;
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    rmSync(dataDir, { force: true, recursive: true });
  });

  it('does not send when telemetry is disabled', async () => {
    trackServeStarted({
      dataDir,
      env: { OWOX_TELEMETRY_DISABLED: '1', POSTHOG_API_KEY: 'phc_test' },
      log() {},
      payload: basePayload(),
    });
    await tick();
    expect(fetchCalls).to.equal(0);
  });

  it('does not send when no PostHog key is configured', async () => {
    trackServeStarted({
      dataDir,
      env: {},
      log() {},
      payload: basePayload(),
    });
    await tick();
    expect(fetchCalls).to.equal(0);
  });

  it('never throws even if sending fails', () => {
    globalThis.fetch = (() => {
      throw new Error('boom');
    }) as typeof globalThis.fetch;
    expect(() =>
      trackServeStarted({
        dataDir,
        env: { POSTHOG_API_KEY: 'phc_test' },
        log() {},
        payload: basePayload(),
      })
    ).to.not.throw();
  });
});

function basePayload() {
  return {
    /* eslint-disable camelcase */
    cli_version: '0.26.0',
    idp_provider: 'none',
    is_docker: false,
    node_version: 'v22.16.0',
    os_arch: 'arm64',
    os_platform: 'darwin',
    web_enabled: true,
    /* eslint-enable camelcase */
  };
}

function tick(): Promise<void> {
  return new Promise<void>(resolve => {
    setTimeout(resolve, 10);
  });
}
