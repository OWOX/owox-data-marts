import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUserTokenChannel, type UserTokenChannel } from './userTokenChannel';

const PLUGIN_ORIGIN = 'https://plugins.example.com';
const SESSION = { projectId: 'j1', userId: 'u1' };
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function fakePort() {
  return { postMessage: vi.fn(), close: vi.fn() };
}

function setup(fetchUserToken = vi.fn(() => Promise.resolve('member-access-token'))) {
  const framePosted = vi.fn();
  const contentWindow = { postMessage: framePosted } as unknown as Window;
  const iframe = { contentWindow } as HTMLIFrameElement;
  const channel = createUserTokenChannel({
    iframe,
    pluginOrigin: PLUGIN_ORIGIN,
    session: SESSION,
    fetchUserToken,
  });
  const ask = async (
    data: unknown,
    {
      origin = PLUGIN_ORIGIN,
      source = contentWindow,
      ports = [fakePort()],
    }: { origin?: string; source?: Window; ports?: ReturnType<typeof fakePort>[] } = {}
  ) => {
    const event = new MessageEvent('message', { data, origin, source });
    Object.defineProperty(event, 'ports', { value: ports });
    window.dispatchEvent(event);
    await flush();
    return ports;
  };
  return { channel, framePosted, fetchUserToken, ask };
}

describe('user token channel', () => {
  let channel: UserTokenChannel | undefined;
  afterEach(() => {
    channel?.dispose();
    channel = undefined;
  });

  it('answers on the port of the request and nowhere else', async () => {
    const h = setup();
    channel = h.channel;

    const [port] = await h.ask({ owox: 'user-token-request' });

    expect(h.fetchUserToken).toHaveBeenLastCalledWith(false, SESSION);
    expect(port.postMessage).toHaveBeenCalledTimes(1);
    expect(port.postMessage).toHaveBeenCalledWith({ token: 'member-access-token' });
    expect(port.close).toHaveBeenCalledTimes(1);
    expect(h.framePosted).not.toHaveBeenCalled();
  });

  it('passes a request for a fresh token on', async () => {
    const h = setup();
    channel = h.channel;

    await h.ask({ owox: 'user-token-request', fresh: true });

    expect(h.fetchUserToken).toHaveBeenLastCalledWith(true, SESSION);
  });

  it('ignores another window', async () => {
    const h = setup();
    channel = h.channel;

    const [port] = await h.ask({ owox: 'user-token-request' }, { source: window });

    expect(h.fetchUserToken).not.toHaveBeenCalled();
    expect(port.postMessage).not.toHaveBeenCalled();
  });

  it.each(['null', 'https://evil.example.com', window.location.origin])(
    'ignores the frame when it speaks from %s',
    async origin => {
      const h = setup();
      channel = h.channel;

      const [port] = await h.ask({ owox: 'user-token-request' }, { origin });

      expect(h.fetchUserToken).not.toHaveBeenCalled();
      expect(port.postMessage).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['a malformed fresh flag', { owox: 'user-token-request', fresh: 'true' }],
    ['another envelope', { owox: 'plugin-ready' }],
    ['no envelope', 'user-token-request'],
    ['nothing', null],
  ])('ignores a request with %s', async (_label, data) => {
    const h = setup();
    channel = h.channel;

    const [port] = await h.ask(data);

    expect(h.fetchUserToken).not.toHaveBeenCalled();
    expect(port.postMessage).not.toHaveBeenCalled();
  });

  it.each([
    ['no port', []],
    ['two ports', [fakePort(), fakePort()]],
  ])('ignores a request with %s', async (_label, ports) => {
    const h = setup();
    channel = h.channel;

    await h.ask({ owox: 'user-token-request' }, { ports });

    expect(h.fetchUserToken).not.toHaveBeenCalled();
    for (const port of ports) expect(port.postMessage).not.toHaveBeenCalled();
  });

  it('answers a failure without its reason', async () => {
    const h = setup(vi.fn(() => Promise.reject(new Error('secret detail'))));
    channel = h.channel;

    const [port] = await h.ask({ owox: 'user-token-request' });

    expect(port.postMessage).toHaveBeenCalledWith({ error: true });
  });

  it('is silent once disposed, even for a request already in flight', async () => {
    let release: (token: string) => void = () => undefined;
    const h = setup(vi.fn(() => new Promise<string>(resolve => (release = resolve))));

    const [inFlight] = await h.ask({ owox: 'user-token-request' });
    h.channel.dispose();
    release('member-access-token');
    const [late] = await h.ask({ owox: 'user-token-request' });

    expect(h.fetchUserToken).toHaveBeenCalledTimes(1);
    expect(inFlight.postMessage).not.toHaveBeenCalled();
    expect(late.postMessage).not.toHaveBeenCalled();
  });
});
