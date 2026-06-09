import { expect } from 'chai';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { trackServeStarted } from '../../src/telemetry/track-serve-started.js';

interface CaptureServer {
  close: () => Promise<void>;
  received: string[];
  url: string;
}

async function startCaptureServer(): Promise<CaptureServer> {
  const received: string[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', c => {
      body += c;
    });
    req.on('end', () => {
      received.push(body);
      res.statusCode = 200;
      res.end('ok');
    });
  });
  await new Promise<void>(r => {
    server.listen(0, '127.0.0.1', r);
  });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    close: () =>
      new Promise<void>(r => {
        server.close(() => {
          r();
        });
      }),
    received,
    url: `http://127.0.0.1:${port}`,
  };
}

describe('trackServeStarted', () => {
  let server: CaptureServer | undefined;
  let dataDir: string;

  beforeEach(() => {
    // Hermetic anonymous-id store: keep telemetry.json out of the real OS app-data dir.
    dataDir = mkdtempSync(join(tmpdir(), 'owox-telemetry-test-'));
  });

  afterEach(async () => {
    rmSync(dataDir, { force: true, recursive: true });
    if (server) {
      await server.close();
      server = undefined;
    }
  });

  it('does not send when telemetry is disabled', async () => {
    server = await startCaptureServer();
    trackServeStarted({
      dataDir,
      env: { OWOX_TELEMETRY_DISABLED: '1', POSTHOG_API_KEY: 'phc_test', POSTHOG_HOST: server.url },
      log() {},
      payload: basePayload(),
    });
    await tick();
    expect(server.received.length).to.equal(0);
  });

  it('does not send when no PostHog key is configured', async () => {
    server = await startCaptureServer();
    trackServeStarted({
      dataDir,
      env: { POSTHOG_HOST: server.url },
      log() {},
      payload: basePayload(),
    });
    await tick();
    expect(server.received.length).to.equal(0);
  });

  it('sends the cli.serve.started event with an anonymous, PII-free payload', async () => {
    server = await startCaptureServer();
    trackServeStarted({
      dataDir,
      env: { POSTHOG_API_KEY: 'phc_test', POSTHOG_HOST: server.url },
      log() {},
      payload: basePayload(),
    });
    await waitForReceived(server);

    expect(server.received.length).to.equal(1);
    const body = JSON.parse(server.received[0]) as {
      distinct_id: string;
      event: string;
      properties: Record<string, unknown>;
    };
    expect(body.event).to.equal('cli.serve.started');
    expect(body.distinct_id).to.be.a('string').with.length.greaterThan(0);
    // anonymousId is the distinct_id only — it must never appear in properties.
    expect(body.properties).to.not.have.property('anonymousId');
    expect(body.properties).to.deep.equal(basePayload());
  });

  it('never throws even if sending fails', () => {
    expect(() =>
      trackServeStarted({
        dataDir,
        env: { POSTHOG_API_KEY: 'phc_test', POSTHOG_HOST: 'http://127.0.0.1:1' },
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

/** Poll until the capture server receives a request (fire-and-forget delivery is async). */
function waitForReceived(s: CaptureServer, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  return new Promise<void>(resolve => {
    const check = (): void => {
      if (s.received.length > 0 || Date.now() - start >= timeoutMs) {
        resolve();
      } else {
        setTimeout(check, 10);
      }
    };

    check();
  });
}
