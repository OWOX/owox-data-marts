import { createServer, type Server } from 'node:http';
import { BaseEvent } from '../base-event.js';
import { TelemetryEvent } from '../telemetry-event.js';
import { PostHogTransport } from './posthog-transport.js';

class ServeStartedEvent extends TelemetryEvent<{ anonymousId: string; cli_version: string }> {
  override get name(): string {
    return 'cli.serve.started';
  }
}

class DomainEvent extends BaseEvent<{ email: string }> {
  override get name(): string {
    return 'user.created';
  }
}

interface CaptureServer {
  url: string;
  received: string[];
  close: () => Promise<void>;
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

describe('PostHogTransport', () => {
  let server: CaptureServer | undefined;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined;
    }
  });

  it('posts a telemetry event to the capture endpoint', async () => {
    server = await startCaptureServer();
    const transport = new PostHogTransport({
      apiKey: 'phc_test',
      host: server.url,
      timeoutMs: 3000,
    });
    await transport.send(new ServeStartedEvent({ anonymousId: 'uuid-1', cli_version: '0.26.0' }));

    expect(server.received.length).toBe(1);
    const body = JSON.parse(server.received[0]);
    expect(body.api_key).toBe('phc_test');
    expect(body.event).toBe('cli.serve.started');
    expect(body.distinct_id).toBe('uuid-1');
    expect(body.properties).toEqual({ cli_version: '0.26.0' });
    expect(typeof body.timestamp).toBe('string');
  });

  it('is a no-op for non-telemetry events', async () => {
    server = await startCaptureServer();
    const transport = new PostHogTransport({
      apiKey: 'phc_test',
      host: server.url,
      timeoutMs: 3000,
    });
    await transport.send(new DomainEvent({ email: 'a@b.com' }));
    expect(server.received.length).toBe(0);
  });

  it('does not send when anonymousId is missing', async () => {
    server = await startCaptureServer();
    const transport = new PostHogTransport({
      apiKey: 'phc_test',
      host: server.url,
      timeoutMs: 3000,
    });
    // @ts-expect-error intentionally missing anonymousId
    await transport.send(new ServeStartedEvent({ cli_version: '0.26.0' }));
    expect(server.received.length).toBe(0);
  });

  it('does not send when apiKey is empty', async () => {
    server = await startCaptureServer();
    const transport = new PostHogTransport({ apiKey: '', host: server.url, timeoutMs: 3000 });
    await transport.send(new ServeStartedEvent({ anonymousId: 'uuid-1', cli_version: '0.26.0' }));
    expect(server.received.length).toBe(0);
  });

  it('swallows connection errors without throwing', async () => {
    // Point at a port that will refuse connections.
    const transport = new PostHogTransport({
      apiKey: 'phc_test',
      host: 'http://127.0.0.1:1',
      timeoutMs: 200,
    });
    await expect(
      transport.send(new ServeStartedEvent({ anonymousId: 'uuid-1', cli_version: '0.26.0' }))
    ).resolves.toBeUndefined();
  });

  it('does not throw and resolves on timeout to an unresponsive host', async () => {
    // Server accepts the connection but never sends a response.
    let hangServer: Server | undefined;
    try {
      hangServer = createServer(() => {
        // Intentionally never call res.end — simulate unresponsive host.
      });
      await new Promise<void>(r => hangServer!.listen(0, '127.0.0.1', r));
      const addr = hangServer.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;

      const transport = new PostHogTransport({
        apiKey: 'phc_test',
        host: `http://127.0.0.1:${port}`,
        timeoutMs: 200,
      });
      await expect(
        transport.send(new ServeStartedEvent({ anonymousId: 'uuid-1', cli_version: '0.26.0' }))
      ).resolves.toBeUndefined();
    } finally {
      await new Promise<void>(r => hangServer?.close(() => r()) ?? r());
    }
  });
});
