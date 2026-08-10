jest.mock('node:dns', () => ({
  __esModule: true,
  default: { lookup: jest.fn() },
  lookup: jest.fn(),
}));

import dns from 'node:dns';
import { guardedDispatcher, guardedLookup } from './guarded-dispatcher';

const lookup = dns.lookup as unknown as jest.Mock;

/**
 * The point of this suite is the *second* resolution.
 *
 * `assertPublicHttpUrl` vets the name and then hands `fetch` the name, so a publisher
 * serving their own DNS can answer the guard with a public address and the transport with
 * a private one. These tests drive only the transport's lookup, which is the one that
 * decides where the socket actually goes.
 */
describe('guardedDispatcher', () => {
  beforeEach(() => jest.clearAllMocks());

  const answer = (...addresses: string[]) => {
    lookup.mockImplementation(
      (_host: string, _options: unknown, callback: (e: unknown, a: unknown) => void) =>
        callback(
          null,
          addresses.map(address => ({ address, family: address.includes(':') ? 6 : 4 }))
        )
    );
  };

  const get = () =>
    fetch(`http://plugin.example/`, { dispatcher: guardedDispatcher } as RequestInit);

  it.each([
    ['169.254.169.254', 'cloud metadata'],
    ['127.0.0.1', 'loopback'],
    ['10.0.0.5', 'private range'],
    ['::ffff:127.0.0.1', 'ipv4-mapped loopback'],
    ['fe81::1', 'link-local outside fe80:'],
  ])('refuses %s (%s) at connection time', async address => {
    answer(address);

    await expect(get()).rejects.toThrow();
    expect(lookup).toHaveBeenCalled();
  });

  // The whole DNS-rebinding path: whatever the first check saw, this answer is the one
  // the socket would use, and it never gets there.
  it('refuses when a private address is mixed in with a public one', async () => {
    answer('93.184.216.34', '10.0.0.5');

    await expect(get()).rejects.toThrow();
  });

  // Asserted on the lookup itself: a public answer has to reach the socket unchanged, and
  // proving that end to end would mean actually connecting to a public host from a test.
  describe('guardedLookup', () => {
    const resolve = (addresses: string[]) =>
      new Promise<{ error: unknown; addresses: unknown }>(done => {
        answer(...addresses);
        guardedLookup('plugin.example', { all: true }, (error, resolved) =>
          done({ error, addresses: resolved })
        );
      });

    it('passes public answers through untouched', async () => {
      const { error, addresses } = await resolve(['93.184.216.34', '2606:4700:4700::1111']);

      expect(error).toBeNull();
      expect(addresses).toEqual([
        { address: '93.184.216.34', family: 4 },
        { address: '2606:4700:4700::1111', family: 6 },
      ]);
    });

    it('reports why it refused rather than returning an empty answer', async () => {
      const { error } = await resolve(['10.0.0.5']);

      expect(error).toMatchObject({ message: expect.stringContaining('private address') });
    });

    it('propagates a DNS failure instead of treating it as public', async () => {
      lookup.mockImplementation(
        (_host: string, _options: unknown, callback: (e: unknown, a: unknown) => void) =>
          callback(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }), [])
      );

      const { error } = await new Promise<{ error: unknown }>(done =>
        guardedLookup('missing.example', { all: true }, error => done({ error }))
      );

      expect(error).toMatchObject({ code: 'ENOTFOUND' });
    });
  });
});
