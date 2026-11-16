import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUserTokenChannel, type UserTokenChannel } from './userTokenChannel';

const PLUGIN_ORIGIN = 'https://plugins.example.com';
const SESSION = { projectId: 'j1', userId: 'u1' };
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function setup(fetchUserToken = vi.fn(() => Promise.resolve('member-access-token'))) {
  const posted: { data: unknown; targetOrigin: string }[] = [];
  const contentWindow = {
    postMessage: (data: unknown, targetOrigin: string) => posted.push({ data, targetOrigin }),
  } as unknown as Window;
  const iframe = { contentWindow } as HTMLIFrameElement;
  const channel = createUserTokenChannel({
    iframe,
    pluginOrigin: PLUGIN_ORIGIN,
    session: SESSION,
    fetchUserToken,
  });
  const ask = async (data: unknown, origin = PLUGIN_ORIGIN, source: Window = contentWindow) => {
    window.dispatchEvent(new MessageEvent('message', { data, origin, source }));
    await flush();
  };
  return { channel, posted, fetchUserToken, ask };
}

describe('user token channel', () => {
  let channel: UserTokenChannel | undefined;
  afterEach(() => {
    channel?.dispose();
    channel = undefined;
  });

  it('answers the plugin frame with the token, addressed to its origin', async () => {
    const h = setup();
    channel = h.channel;

    await h.ask({ owox: 'user-token-request', id: 'a' });

    expect(h.fetchUserToken).toHaveBeenLastCalledWith(false, SESSION);
    expect(h.posted).toEqual([
      {
        data: { owox: 'user-token-response', id: 'a', token: 'member-access-token' },
        targetOrigin: PLUGIN_ORIGIN,
      },
    ]);
  });

  it('passes a request for a fresh token on', async () => {
    const h = setup();
    channel = h.channel;

    await h.ask({ owox: 'user-token-request', id: 'a', fresh: true });

    expect(h.fetchUserToken).toHaveBeenLastCalledWith(true, SESSION);
  });

  it('ignores another window', async () => {
    const h = setup();
    channel = h.channel;

    await h.ask({ owox: 'user-token-request', id: 'a' }, PLUGIN_ORIGIN, window);

    expect(h.fetchUserToken).not.toHaveBeenCalled();
    expect(h.posted).toHaveLength(0);
  });

  it.each(['null', 'https://evil.example.com', window.location.origin])(
    'ignores the frame when it speaks from %s',
    async origin => {
      const h = setup();
      channel = h.channel;

      await h.ask({ owox: 'user-token-request', id: 'a' }, origin);

      expect(h.fetchUserToken).not.toHaveBeenCalled();
      expect(h.posted).toHaveLength(0);
    }
  );

  it.each([
    ['no id', { owox: 'user-token-request' }],
    ['an empty id', { owox: 'user-token-request', id: '' }],
    ['an id that is not a string', { owox: 'user-token-request', id: 1 }],
    ['an oversized id', { owox: 'user-token-request', id: 'a'.repeat(65) }],
    ['a malformed fresh flag', { owox: 'user-token-request', id: 'a', fresh: 'true' }],
    ['another envelope', { owox: 'plugin-ready', id: 'a' }],
    ['no envelope', 'user-token-request'],
  ])('ignores a request with %s', async (_label, data) => {
    const h = setup();
    channel = h.channel;

    await h.ask(data);

    expect(h.fetchUserToken).not.toHaveBeenCalled();
    expect(h.posted).toHaveLength(0);
  });

  it('answers a failure without its reason', async () => {
    const h = setup(vi.fn(() => Promise.reject(new Error('secret detail'))));
    channel = h.channel;

    await h.ask({ owox: 'user-token-request', id: 'a' });

    expect(h.posted).toEqual([
      { data: { owox: 'user-token-response', id: 'a', error: true }, targetOrigin: PLUGIN_ORIGIN },
    ]);
  });

  it('is silent once disposed, even for a request already in flight', async () => {
    let release: (token: string) => void = () => undefined;
    const h = setup(vi.fn(() => new Promise<string>(resolve => (release = resolve))));

    await h.ask({ owox: 'user-token-request', id: 'a' });
    h.channel.dispose();
    release('member-access-token');
    await h.ask({ owox: 'user-token-request', id: 'b' });

    expect(h.fetchUserToken).toHaveBeenCalledTimes(1);
    expect(h.posted).toHaveLength(0);
  });
});
