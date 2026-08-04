jest.mock('node:dns/promises', () => ({
  __esModule: true,
  default: { resolve4: jest.fn(), resolve6: jest.fn() },
}));

import dns from 'node:dns/promises';
import {
  assertPublicHttpUrl,
  fetchPublicUrl,
  isPrivateIpv6,
  UnsafeUrlError,
} from './safe-url.helper';

const resolve4 = dns.resolve4 as jest.Mock;
const resolve6 = dns.resolve6 as jest.Mock;

describe('assertPublicHttpUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolve4.mockResolvedValue(['93.184.216.34']);
    resolve6.mockResolvedValue([]);
  });

  it('accepts a public https url and returns the parsed URL', async () => {
    const url = await assertPublicHttpUrl('https://example.com/app?a=1');

    expect(url.hostname).toBe('example.com');
    expect(url.pathname).toBe('/app');
  });

  it.each([
    ['not a url', 'invalid-url'],
    ['', 'invalid-url'],
    ['file:///etc/passwd', 'protocol'],
    ['ftp://example.com', 'protocol'],
    ['http://localhost', 'internal-host'],
    ['http://0.0.0.0', 'internal-host'],
    ['http://[::1]/', 'internal-host'],
    ['http://127.0.0.1', 'private-ipv4'],
    ['http://10.0.0.1', 'private-ipv4'],
    ['http://172.16.0.1', 'private-ipv4'],
    ['http://192.168.1.1', 'private-ipv4'],
    ['http://100.64.0.1', 'private-ipv4'],
    ['http://240.0.0.1', 'private-ipv4'],
    // The forms the prefix-matching classifier used to pass straight through.
    ['https://[fe81::1]/', 'private-ipv6'],
    ['https://[febf::1]/', 'private-ipv6'],
    ['https://[::ffff:127.0.0.1]/', 'private-ipv6'],
    ['https://[::ffff:169.254.169.254]/', 'private-ipv6'],
  ])('rejects %s as %s', async (rawUrl, reason) => {
    await expect(assertPublicHttpUrl(rawUrl)).rejects.toMatchObject({ reason });
  });

  it('rejects the cloud metadata endpoint', async () => {
    await expect(
      assertPublicHttpUrl('http://169.254.169.254/latest/meta-data/')
    ).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it('rejects http when the caller allows https only', async () => {
    await expect(
      assertPublicHttpUrl('http://example.com', { allowedProtocols: ['https:'] })
    ).rejects.toMatchObject({ reason: 'protocol' });
  });

  it('rejects DNS rebinding to a private ipv4 address', async () => {
    resolve4.mockResolvedValue(['169.254.169.254']);

    await expect(assertPublicHttpUrl('https://public.example')).rejects.toMatchObject({
      reason: 'private-ipv4',
    });
  });

  it('rejects DNS rebinding to a private ipv6 address', async () => {
    resolve4.mockResolvedValue([]);
    resolve6.mockResolvedValue(['fd00::1']);

    await expect(assertPublicHttpUrl('https://public.example')).rejects.toMatchObject({
      reason: 'private-ipv6',
    });
  });

  it('checks every resolved address, not just the first', async () => {
    resolve4.mockResolvedValue(['93.184.216.34', '10.0.0.5']);

    await expect(assertPublicHttpUrl('https://public.example')).rejects.toMatchObject({
      reason: 'private-ipv4',
    });
  });

  it('refuses a hostname that cannot be resolved', async () => {
    resolve4.mockRejectedValue(new Error('ENOTFOUND'));
    resolve6.mockRejectedValue(new Error('ENOTFOUND'));

    await expect(assertPublicHttpUrl('https://nonexistent.example')).rejects.toMatchObject({
      reason: 'dns-unresolvable',
    });
  });

  it('refuses a hostname that resolves to no addresses', async () => {
    resolve4.mockResolvedValue([]);
    resolve6.mockResolvedValue([]);

    await expect(assertPublicHttpUrl('https://empty.example')).rejects.toMatchObject({
      reason: 'dns-unresolvable',
    });
  });

  // A-only and AAAA-only hosts are normal: only one family needs to answer.
  it('accepts a host that only has an AAAA record', async () => {
    resolve4.mockRejectedValue(new Error('ENOTFOUND'));
    resolve6.mockResolvedValue(['2001:4860:4860::8888']);

    await expect(assertPublicHttpUrl('https://ipv6-only.example')).resolves.toBeInstanceOf(URL);
  });

  it('accepts a public IPv4 literal without consulting DNS', async () => {
    await expect(assertPublicHttpUrl('https://93.184.216.34/app')).resolves.toBeInstanceOf(URL);
    expect(resolve4).not.toHaveBeenCalled();
    expect(resolve6).not.toHaveBeenCalled();
  });

  it('rejects a private IPv6 literal without consulting DNS', async () => {
    await expect(assertPublicHttpUrl('https://[fd00::1]/')).rejects.toMatchObject({
      reason: 'private-ipv6',
    });
    expect(resolve4).not.toHaveBeenCalled();
    expect(resolve6).not.toHaveBeenCalled();
  });
});

describe('fetchPublicUrl', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    resolve4.mockResolvedValue(['93.184.216.34']);
    resolve6.mockResolvedValue([]);
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  const redirectTo = (location: string) =>
    new Response(null, { status: 302, headers: { location } });

  it('refuses a redirect into a private network', async () => {
    fetchMock.mockResolvedValueOnce(redirectTo('http://169.254.169.254/latest/meta-data/'));

    await expect(fetchPublicUrl('https://example.com/hook', { method: 'POST' })).rejects.toThrow(
      UnsafeUrlError
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('replays method and body on a guarded hop', async () => {
    fetchMock
      .mockResolvedValueOnce(redirectTo('https://example.com/moved'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const response = await fetchPublicUrl('https://example.com/hook', {
      method: 'POST',
      body: '{"a":1}',
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://example.com/moved',
      expect.objectContaining({ method: 'POST', body: '{"a":1}', redirect: 'manual' })
    );
  });

  it('gives up rather than looping forever', async () => {
    fetchMock.mockResolvedValue(redirectTo('https://example.com/next'));

    await expect(
      fetchPublicUrl('https://example.com/hook', { method: 'POST' })
    ).rejects.toMatchObject({ reason: 'too-many-redirects' });
  });
});

describe('isPrivateIpv6', () => {
  it.each([
    '::1',
    '::',
    'fe80::1',
    // The whole of fe80::/10, not just the first block -- a prefix test on `fe80:`
    // let every one of these through.
    'fe81::1',
    'fe90::1',
    'feaf::1',
    'febf::1',
    'fc00::1',
    'fd00::1',
    'FD00::1',
    // Reaches the IPv4 stack, so it matches no IPv6 prefix at all.
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    '::ffff:169.254.169.254',
    '::ffff:192.168.1.1',
    // Same address, hex spelling.
    '::ffff:7f00:1',
    // Deprecated IPv4-compatible form: unparseable, so refused rather than assumed public.
    '::127.0.0.1',
    'ff02::1',
    // Embeds 127.0.0.1 in the 6to4 prefix.
    '2002:7f00:1::',
    'not-an-address',
  ])('flags %s', address => {
    expect(isPrivateIpv6(address)).toBe(true);
  });

  it.each(['2001:4860:4860::8888', '2606:4700:4700::1111', '::ffff:8.8.8.8'])(
    'allows %s',
    address => {
      expect(isPrivateIpv6(address)).toBe(false);
    }
  );
});
