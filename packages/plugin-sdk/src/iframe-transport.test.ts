import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIframeTransport, PluginTransportError } from './iframe-transport.js';
import type { PluginRequest, PluginResponse } from './protocol.js';

const openPorts: MessagePort[] = [];

/** Stands in for the host end of the channel, so each test controls exactly when it answers. */
function hostSide() {
  const channel = new MessageChannel();
  const received: PluginRequest[] = [];
  openPorts.push(channel.port1, channel.port2);

  channel.port1.onmessage = (event: MessageEvent<PluginRequest>) => {
    received.push(event.data);
  };
  channel.port1.start();

  return {
    transport: createIframeTransport(channel.port2),
    received,
    waitForReceived: async (count = 1) => {
      await vi.waitFor(() => {
        expect(received).toHaveLength(count);
      });
      return received;
    },
    answer: (response: PluginResponse, transfer: Transferable[] = []) => {
      channel.port1.postMessage(response, transfer);
    },
  };
}

describe('iframe transport', () => {
  afterEach(() => {
    for (const port of openPorts.splice(0)) {
      port.close();
    }
    vi.useRealTimers();
  });

  it('forwards a json request and resolves with its body', async () => {
    const host = hostSide();

    const pending = host.transport.getJson<{ ok: boolean }>('/api/data-marts');
    await host.waitForReceived();

    expect(host.received[0]).toMatchObject({ kind: 'api', method: 'GET', path: '/api/data-marts' });
    host.answer({
      id: host.received[0].id,
      ok: true,
      status: 200,
      headers: {},
      body: { ok: true },
    });

    await expect(pending).resolves.toEqual({ ok: true });
  });

  it('forwards a PATCH JSON request with its body', async () => {
    const host = hostSide();

    const pending = host.transport.patchJson<{ title: string }>('/api/data-marts/dm-1', {
      title: 'Renamed data mart',
    });
    await host.waitForReceived();

    expect(host.received[0]).toMatchObject({
      kind: 'api',
      method: 'PATCH',
      path: '/api/data-marts/dm-1',
      body: { title: 'Renamed data mart' },
    });
    host.answer({
      id: host.received[0].id,
      ok: true,
      status: 200,
      headers: {},
      body: { title: 'Renamed data mart' },
    });

    await expect(pending).resolves.toEqual({ title: 'Renamed data mart' });
  });

  it('forwards a DELETE request without a body and resolves its JSON body', async () => {
    const host = hostSide();

    const pending = host.transport.deleteJson<{ deleted: true }>('/api/data-marts/dm-1');
    await host.waitForReceived();

    expect(host.received[0]).toMatchObject({
      kind: 'api',
      method: 'DELETE',
      path: '/api/data-marts/dm-1',
    });
    expect(host.received[0]).not.toHaveProperty('body');
    host.answer({
      id: host.received[0].id,
      ok: true,
      status: 200,
      headers: {},
      body: { deleted: true },
    });

    await expect(pending).resolves.toEqual({ deleted: true });
  });

  it('resolves a DELETE response without a body as undefined', async () => {
    const host = hostSide();

    const pending = host.transport.deleteJson('/api/data-marts/dm-1');
    await host.waitForReceived();

    expect(host.received[0]).toMatchObject({ method: 'DELETE', path: '/api/data-marts/dm-1' });
    host.answer({
      id: host.received[0].id,
      ok: true,
      status: 204,
      headers: {},
      body: undefined,
    });

    await expect(pending).resolves.toBeUndefined();
  });

  // Plugin authors never see a correlation id, so they cannot address someone else's
  // in-flight request even by accident.
  it('generates its own correlation ids', async () => {
    const host = hostSide();

    void host.transport.getJson('/api/a');
    void host.transport.getJson('/api/b');
    await host.waitForReceived(2);

    expect(host.received[0].id).toBeTruthy();
    expect(host.received[0].id).not.toBe(host.received[1].id);
  });

  it('resolves out-of-order answers to the right callers', async () => {
    const host = hostSide();

    const first = host.transport.getJson<string>('/api/a');
    const second = host.transport.getJson<string>('/api/b');
    await host.waitForReceived(2);

    const [a, b] = host.received;
    host.answer({ id: b.id, ok: true, status: 200, headers: {}, body: 'second' });
    host.answer({ id: a.id, ok: true, status: 200, headers: {}, body: 'first' });

    await expect(first).resolves.toBe('first');
    await expect(second).resolves.toBe('second');
  });

  it('ignores an answer to an id it never sent', async () => {
    const host = hostSide();

    const pending = host.transport.getJson('/api/a');
    await host.waitForReceived();
    host.answer({ id: 'not-ours', ok: true, status: 200, headers: {}, body: 'nope' });

    host.answer({ id: host.received[0].id, ok: true, status: 200, headers: {}, body: 'ours' });
    await expect(pending).resolves.toBe('ours');
  });

  // A duplicate after settling must be a no-op rather than resolving a second time or
  // throwing from inside the message handler.
  it('ignores a duplicate answer', async () => {
    const host = hostSide();

    const pending = host.transport.getJson('/api/a');
    await host.waitForReceived();
    const { id } = host.received[0];

    host.answer({ id, ok: true, status: 200, headers: {}, body: 'first' });
    await expect(pending).resolves.toBe('first');

    expect(() => {
      host.answer({ id, ok: true, status: 200, headers: {}, body: 'second' });
    }).not.toThrow();
  });

  it('surfaces a host-side refusal as an error carrying its code', async () => {
    const host = hostSide();

    const pending = host.transport.getJson('/api/data-marts');
    await host.waitForReceived();
    host.answer({
      id: host.received[0].id,
      ok: false,
      error: { code: 'FORBIDDEN', message: 'path must be under /api/' },
    });

    await expect(pending).rejects.toBeInstanceOf(PluginTransportError);
    await expect(pending).rejects.toMatchObject({ payload: { code: 'FORBIDDEN' } });
  });

  it('gives up on a request the host never answers', async () => {
    const host = hostSide();
    vi.useFakeTimers();

    const pending = host.transport.getJson('/api/data-marts');
    const assertion = expect(pending).rejects.toMatchObject({ payload: { code: 'TIMEOUT' } });
    await vi.advanceTimersByTimeAsync(30_001);
    await assertion;
  });

  describe('streams', () => {
    // NDJSON traversals legitimately run for minutes, so the timer that guards a plain
    // request would kill them.
    it('sets no timeout on a stream request', async () => {
      const host = hostSide();

      const streamed = new ReadableStream<Uint8Array>();
      const pending = host.transport.getStream('/api/external/http-data/dm-1.ndjson');
      await host.waitForReceived();

      // Well past the 30s a plain request would allow itself.
      vi.useFakeTimers();
      await vi.advanceTimersByTimeAsync(60_000);
      vi.useRealTimers();

      host.answer(
        {
          id: host.received[0].id,
          ok: true,
          status: 200,
          headers: { 'content-type': 'application/x-ndjson' },
          stream: streamed,
        },
        [streamed]
      );

      await expect(pending).resolves.toBeInstanceOf(Response);
    });

    it('rebuilds a Response so existing traversal code keeps working', async () => {
      const host = hostSide();

      // Transferred, not copied: that is what lets rows arrive as they are produced
      // rather than after the whole traversal completes.
      const streamed = new ReadableStream<Uint8Array>();
      const pending = host.transport.getStream('/api/x');
      await host.waitForReceived();
      host.answer(
        {
          id: host.received[0].id,
          ok: true,
          status: 200,
          headers: { 'x-owox-run-id': 'run-7' },
          stream: streamed,
        },
        [streamed]
      );

      const response = await pending;
      // The traversal reads this header, so it has to survive the trip.
      expect(response.headers.get('x-owox-run-id')).toBe('run-7');
    });

    it('reports a stream answer that carries no stream', async () => {
      const host = hostSide();

      const pending = host.transport.getStream('/api/x');
      await host.waitForReceived();
      host.answer({ id: host.received[0].id, ok: true, status: 200, headers: {}, body: null });

      await expect(pending).rejects.toMatchObject({ payload: { code: 'PROTOCOL_ERROR' } });
    });

    it('sends query parameters as pairs the host can read back', async () => {
      const host = hostSide();

      void host.transport.getStream('/api/x', new URLSearchParams({ limit: '10' }));
      await host.waitForReceived();

      expect(host.received[0]).toMatchObject({ stream: true, query: [['limit', '10']] });
    });

    // `?column=a&column=b` is how the API client asks for two columns. Flattening to an
    // object kept only the last one, so a plugin silently traversed a narrower dataset
    // than the identical call makes outside the iframe.
    it('keeps every value of a repeated query key', async () => {
      const host = hostSide();
      const query = new URLSearchParams();
      query.append('column', 'Event Date');
      query.append('column', 'Revenue');
      query.append('limit', '5');

      void host.transport.getStream('/api/x', query);
      await host.waitForReceived();

      expect(host.received[0]).toMatchObject({
        query: [
          ['column', 'Event Date'],
          ['column', 'Revenue'],
          ['limit', '5'],
        ],
      });
    });

    it('sends a plain record as pairs too, so the host reads one shape', async () => {
      const host = hostSide();

      void host.transport.getJson('/api/x', { limit: '10', offset: '25' });
      await host.waitForReceived();

      expect(host.received[0]).toMatchObject({
        query: [
          ['limit', '10'],
          ['offset', '25'],
        ],
      });
    });
  });
});
