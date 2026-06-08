import { jest } from '@jest/globals';
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

const config = { apiKey: 'phc_test', host: 'https://eu.i.posthog.com', timeoutMs: 3000 };

describe('PostHogTransport', () => {
  let fetchMock: jest.Mock;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = jest.fn(async () => ({ ok: true }) as Response);
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('posts a telemetry event to the capture endpoint', async () => {
    const transport = new PostHogTransport(config);
    await transport.send(new ServeStartedEvent({ anonymousId: 'uuid-1', cli_version: '0.26.0' }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://eu.i.posthog.com/i/v0/e/');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.api_key).toBe('phc_test');
    expect(body.event).toBe('cli.serve.started');
    expect(body.distinct_id).toBe('uuid-1');
    expect(body.properties).toEqual({ cli_version: '0.26.0' });
    expect(typeof body.timestamp).toBe('string');
  });

  it('is a no-op for non-telemetry events', async () => {
    const transport = new PostHogTransport(config);
    await transport.send(new DomainEvent({ email: 'a@b.com' }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not send when anonymousId is missing', async () => {
    const transport = new PostHogTransport(config);
    // @ts-expect-error intentionally missing anonymousId
    await transport.send(new ServeStartedEvent({ cli_version: '0.26.0' }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not send when apiKey is empty', async () => {
    const transport = new PostHogTransport({ ...config, apiKey: '' });
    await transport.send(new ServeStartedEvent({ anonymousId: 'uuid-1', cli_version: '0.26.0' }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('swallows fetch errors without throwing', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    const transport = new PostHogTransport(config);
    await expect(
      transport.send(new ServeStartedEvent({ anonymousId: 'uuid-1', cli_version: '0.26.0' }))
    ).resolves.toBeUndefined();
  });

  it('passes an abort signal and swallows abort errors', async () => {
    let receivedSignal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce(async (_url: unknown, init: RequestInit) => {
      receivedSignal = init.signal ?? undefined;
      const err = new Error('Aborted');
      err.name = 'AbortError';
      throw err;
    });
    const transport = new PostHogTransport(config);
    await expect(
      transport.send(new ServeStartedEvent({ anonymousId: 'uuid-1', cli_version: '0.26.0' }))
    ).resolves.toBeUndefined();
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
  });
});
