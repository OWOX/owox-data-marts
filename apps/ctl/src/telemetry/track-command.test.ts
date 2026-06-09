import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { trackCommand } from './track-command.js';

interface CaptureServer {
  url: string;
  received: string[];
  close: () => Promise<void>;
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

async function startCaptureServer(): Promise<CaptureServer> {
  const received: string[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      received.push(body);
      res.statusCode = 200;
      res.end('ok');
    });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    received,
    close: () => new Promise<void>(r => server.close(() => r())),
  };
}

describe('trackCommand', () => {
  let server: CaptureServer | undefined;
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'ctl-tele-'));
  });
  afterEach(async () => {
    rmSync(dataDir, { force: true, recursive: true });
    if (server) {
      await server.close();
      server = undefined;
    }
  });

  it('sends the cli.command.invoked event with an anonymous, PII-free payload', async () => {
    server = await startCaptureServer();
    trackCommand({
      cliVersion: '0.26.0',
      command: 'data-marts:list',
      dataDir,
      env: { POSTHOG_API_KEY: 'phc_test', POSTHOG_HOST: server.url },
    });
    await waitForReceived(server);

    expect(server.received.length).toBe(1);
    const body = JSON.parse(server.received[0]) as {
      distinct_id: string;
      event: string;
      properties: Record<string, unknown>;
    };
    expect(body.event).toBe('cli.command.invoked');
    expect(typeof body.distinct_id).toBe('string');
    expect(body.distinct_id.length).toBeGreaterThan(0);
    // anonymousId is the distinct_id only — it must never appear in properties,
    // and only the static command id (never argv/flags) is sent.
    expect(body.properties).not.toHaveProperty('anonymousId');
    expect(body.properties).toEqual({
      /* eslint-disable camelcase */
      cli_version: '0.26.0',
      command: 'data-marts:list',
      node_version: process.version,
      os_arch: process.arch,
      os_platform: process.platform,
      /* eslint-enable camelcase */
    });
  });

  it('does not send when disabled', async () => {
    server = await startCaptureServer();
    trackCommand({
      cliVersion: '0.26.0',
      command: 'status',
      dataDir,
      env: { OWOX_TELEMETRY_DISABLED: '1', POSTHOG_API_KEY: 'phc_test', POSTHOG_HOST: server.url },
    });
    await new Promise(r => setTimeout(r, 50));
    expect(server.received.length).toBe(0);
  });

  it('does not send when no key configured', async () => {
    server = await startCaptureServer();
    trackCommand({
      cliVersion: '0.26.0',
      command: 'status',
      dataDir,
      env: { POSTHOG_HOST: server.url },
    });
    await new Promise(r => setTimeout(r, 50));
    expect(server.received.length).toBe(0);
  });

  it('never throws when sending fails', () => {
    expect(() =>
      trackCommand({
        cliVersion: '0.26.0',
        command: 'status',
        dataDir,
        env: { POSTHOG_API_KEY: 'phc_test', POSTHOG_HOST: 'http://127.0.0.1:1' },
      })
    ).not.toThrow();
  });
});
