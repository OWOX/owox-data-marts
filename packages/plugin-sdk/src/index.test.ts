import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetForTests, connect } from './index.js';

/**
 * happy-dom gives an unframed document, where window.parent === window. Standing in a
 * distinct object is what makes the identity check meaningful at all -- and is exactly
 * the situation the SDK must refuse when it is real.
 */
function pretendToBeFramed() {
  const parent = { postMessage: vi.fn() };
  Object.defineProperty(window, 'parent', { value: parent, configurable: true, writable: true });
  return parent;
}

function unframe() {
  Object.defineProperty(window, 'parent', { value: window, configurable: true, writable: true });
}

function hostInit(nonce = 'nonce-1') {
  return {
    owox: 'host-init' as const,
    v: 1 as const,
    nonce,
    context: {
      pluginId: 'p1',
      installationId: 'i1',
      projectId: 'j1',
      userId: 'u1',
      theme: 'light' as const,
    },
  };
}

/**
 * Delivers a message as the host page would.
 *
 * The default origin is a real one on purpose: the opaque origin belongs to the plugin,
 * so a message arriving *from* the host carries the host's own. Defaulting to 'null'
 * here is what hid a handshake that refused every genuine host.
 */
function deliverFromParent(
  parent: object,
  data: unknown,
  ports: MessagePort[],
  origin = 'https://app.owox.test'
) {
  const event = new MessageEvent('message', { data, origin, ports });
  Object.defineProperty(event, 'source', { value: parent });
  window.dispatchEvent(event);
}

describe('connect', () => {
  beforeEach(() => {
    __resetForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    unframe();
  });

  it('refuses to connect when the page is not framed', async () => {
    unframe();

    await expect(connect()).rejects.toThrow(/not running inside an OWOX plugin frame/);
  });

  it('announces itself to the host and keeps announcing until answered', async () => {
    const parent = pretendToBeFramed();

    void connect();
    await vi.advanceTimersByTimeAsync(600);

    expect(parent.postMessage.mock.calls.length).toBeGreaterThan(1);
    const [message, targetOrigin] = parent.postMessage.mock.calls[0] as [
      { owox: string; v: number },
      string,
    ];
    expect(message).toMatchObject({ owox: 'plugin-ready', v: 1 });
    // A concrete target origin never matches an opaque one, so anything else would be
    // dropped silently by the browser.
    expect(targetOrigin).toBe('*');
  });

  it('gives up rather than hanging when no host answers', async () => {
    pretendToBeFramed();

    const pending = connect();
    const assertion = expect(pending).rejects.toThrow(/did not complete the plugin handshake/);
    await vi.advanceTimersByTimeAsync(10_001);
    await assertion;
  });

  it('completes the handshake and answers on the port', async () => {
    const parent = pretendToBeFramed();
    const channel = new MessageChannel();
    const hostSide: unknown[] = [];
    channel.port1.onmessage = event => hostSide.push(event.data);
    channel.port1.start();

    const pending = connect();
    await vi.advanceTimersByTimeAsync(0);
    deliverFromParent(parent, hostInit(), [channel.port2]);

    const context = await pending;
    expect(context.pluginId).toBe('p1');
    expect(context.userId).toBe('u1');

    await vi.advanceTimersByTimeAsync(0);
    expect(hostSide).toContainEqual({
      owox: 'plugin-hello',
      v: 1,
      nonce: 'nonce-1',
    });
  });

  // A plugin script racing the SDK can post to its own window. event.source is then the
  // window itself, never window.parent.
  it('ignores a host-init the page posts to itself', async () => {
    pretendToBeFramed();
    const channel = new MessageChannel();

    const pending = connect();
    await vi.advanceTimersByTimeAsync(0);
    deliverFromParent(window, hostInit(), [channel.port2]);

    const assertion = expect(pending).rejects.toThrow(/did not complete/);
    await vi.advanceTimersByTimeAsync(10_001);
    await assertion;
  });

  /**
   * The host's origin is a real one, and the plugin cannot know it: OWOX is deployed
   * under whatever domain the customer runs. This test replaces one that asserted the
   * opposite -- it demanded "null" and so described a handshake that never completed
   * anywhere but in the test suite.
   */
  it('accepts a host-init from the real origin the host is served on', async () => {
    const parent = pretendToBeFramed();
    const channel = new MessageChannel();

    const pending = connect();
    await vi.advanceTimersByTimeAsync(0);
    deliverFromParent(parent, hostInit(), [channel.port2], 'https://owox.customer.example');

    await expect(pending).resolves.toMatchObject({ pluginId: 'p1' });
  });

  it('rejects a host-init from an unsupported protocol v2 host', async () => {
    const parent = pretendToBeFramed();
    const channel = new MessageChannel();

    const pending = connect();
    await vi.advanceTimersByTimeAsync(0);
    deliverFromParent(parent, { ...hostInit(), v: 2 }, [channel.port2]);

    const assertion = expect(pending).rejects.toThrow(/did not complete/);
    await vi.advanceTimersByTimeAsync(10_001);
    await assertion;
  });

  // Identity of the sender is the check that remains, and it still has to hold.
  it('ignores a host-init from a window that is not the parent', async () => {
    pretendToBeFramed();
    const channel = new MessageChannel();

    const pending = connect();
    await vi.advanceTimersByTimeAsync(0);
    deliverFromParent({ notTheParent: true }, hostInit(), [channel.port2]);

    const assertion = expect(pending).rejects.toThrow(/did not complete/);
    await vi.advanceTimersByTimeAsync(10_001);
    await assertion;
  });

  it('ignores a host-init carrying no port', async () => {
    const parent = pretendToBeFramed();

    const pending = connect();
    await vi.advanceTimersByTimeAsync(0);
    deliverFromParent(parent, hostInit(), []);

    const assertion = expect(pending).rejects.toThrow(/did not complete/);
    await vi.advanceTimersByTimeAsync(10_001);
    await assertion;
  });

  // Once bound, the channel is fixed for the document's lifetime: a later host-init,
  // forged or genuine, cannot redirect a running plugin onto another port.
  it('refuses to rebind after the handshake', async () => {
    const parent = pretendToBeFramed();
    const first = new MessageChannel();
    const attacker = new MessageChannel();
    const attackerSaw: unknown[] = [];
    attacker.port1.onmessage = event => attackerSaw.push(event.data);
    attacker.port1.start();

    const pending = connect();
    await vi.advanceTimersByTimeAsync(0);
    deliverFromParent(parent, hostInit(), [first.port2]);
    await pending;

    deliverFromParent(parent, hostInit('nonce-2'), [attacker.port2]);
    await vi.advanceTimersByTimeAsync(10);

    expect(attackerSaw).toEqual([]);
  });

  // Two asks, two kinds. The host answers them by different rules, so the plugin says
  // which it means rather than leaving the host to guess from a URL shape.
  it('asks the host to open external links and in-app paths separately', async () => {
    const parent = pretendToBeFramed();
    const channel = new MessageChannel();
    const hostSide: { kind?: string; url?: string; path?: string }[] = [];
    channel.port1.onmessage = event => hostSide.push(event.data as { kind?: string });
    channel.port1.start();

    const pending = connect();
    await vi.advanceTimersByTimeAsync(0);
    deliverFromParent(parent, hostInit(), [channel.port2]);

    const context = await pending;
    await context.ui.openExternal('https://docs.example.test');
    context.ui.navigate('/ui/j1/data-marts/dm-1');
    await vi.advanceTimersByTimeAsync(0);

    expect(hostSide).toContainEqual(
      expect.objectContaining({ kind: 'openExternal', url: 'https://docs.example.test' })
    );
    expect(hostSide).toContainEqual(
      expect.objectContaining({ kind: 'navigate', path: '/ui/j1/data-marts/dm-1' })
    );
  });

  it('returns the same promise however often it is called', async () => {
    const parent = pretendToBeFramed();
    const channel = new MessageChannel();

    const first = connect();
    const second = connect();
    await vi.advanceTimersByTimeAsync(0);
    deliverFromParent(parent, hostInit(), [channel.port2]);

    expect(await first).toBe(await second);
  });

  it('exposes no way to reach the port or a credential', async () => {
    const parent = pretendToBeFramed();
    const channel = new MessageChannel();

    const pending = connect();
    await vi.advanceTimersByTimeAsync(0);
    deliverFromParent(parent, hostInit(), [channel.port2]);
    const context = await pending;

    const keys = Object.keys(context);
    expect(keys).not.toContain('port');
    expect(keys).not.toContain('token');

    // The ambient fields are the ones that travel as plain data in the handshake, so they
    // are the ones a credential could ride along in. `owox` is excluded deliberately: it
    // holds the transport, which is the object this whole design keeps out of reach.
    const { owox: _owox, signal: _signal, ui: _ui, ...ambient } = context;
    expect(JSON.stringify(ambient)).not.toContain('token');
  });
});
