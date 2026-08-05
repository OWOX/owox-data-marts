jest.mock('@owox/internal-helpers', () => ({ fetchWithBackoff: jest.fn() }));
jest.mock('node:dns/promises', () => ({
  __esModule: true,
  default: { resolve4: jest.fn(), resolve6: jest.fn() },
}));

import { ConfigService } from '@nestjs/config';
import { fetchWithBackoff } from '@owox/internal-helpers';
import dns from 'node:dns/promises';
import { PublicOriginService } from '../../common/config/public-origin.service';
import { PluginHostConfigService } from '../config/plugin-host.config';
import { ReleaseRejectionCode } from '../enums/release-rejection-code.enum';
import { RemoteUrlValidatorService } from './remote-url-validator.service';

const fetchMock = fetchWithBackoff as jest.Mock;
const resolve4 = dns.resolve4 as jest.Mock;
const resolve6 = dns.resolve6 as jest.Mock;

const PLUGIN_URL = 'https://plugin.example.com';

function service(env: Record<string, string | undefined> = {}): RemoteUrlValidatorService {
  const configService = { get: <T>(key: string) => env[key] as T } as ConfigService;
  return new RemoteUrlValidatorService(
    new PluginHostConfigService(configService, new PublicOriginService(configService))
  );
}

/** Longest matching fragment wins, so a specific path beats the host it hangs off. */
function route(routes: Record<string, () => Response>) {
  fetchMock.mockImplementation((url: string) => {
    const match = Object.keys(routes)
      .filter(fragment => String(url).includes(fragment))
      .sort((a, b) => b.length - a.length)[0];
    if (!match) {
      throw new Error(`unexpected fetch: ${url}`);
    }
    return Promise.resolve(routes[match]());
  });
}

const page = (headers: Record<string, string> = {}) => new Response('<html></html>', { headers });
const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });
const okPlugin = {
  'plugin.example.com': () => page(),
};

describe('RemoteUrlValidatorService', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    resolve4.mockResolvedValue(['93.184.216.34']);
    resolve6.mockResolvedValue([]);
  });

  it('accepts a plain embeddable page', async () => {
    route(okPlugin);

    await expect(service().validate(PLUGIN_URL)).resolves.toEqual({
      ok: true,
      finalUrl: PLUGIN_URL,
    });
  });

  it('never throws, so one bad delivery url cannot abort a sync', async () => {
    fetchMock.mockRejectedValue(new Error('boom'));

    await expect(service().validate(PLUGIN_URL)).resolves.toMatchObject({ ok: false });
  });

  describe('transport safety', () => {
    it('refuses a non-https url without contacting it', async () => {
      await expect(service().validate('http://plugin.example.com')).resolves.toMatchObject({
        code: ReleaseRejectionCode.URL_NOT_HTTPS,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses a url that points straight into a private network', async () => {
      await expect(service().validate('https://10.0.0.1/app')).resolves.toMatchObject({
        code: ReleaseRejectionCode.URL_PRIVATE_NETWORK,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses a hostname whose dns record points inside', async () => {
      resolve4.mockResolvedValue(['169.254.169.254']);

      await expect(service().validate(PLUGIN_URL)).resolves.toMatchObject({
        code: ReleaseRejectionCode.URL_PRIVATE_NETWORK,
      });
    });

    // Fail closed: an unresolvable name never reaches fetch, so a later rebinding answer
    // cannot be the first (and only) resolve that the process performs.
    it('refuses an unresolvable hostname without contacting it', async () => {
      resolve4.mockRejectedValue(new Error('ENOTFOUND'));
      resolve6.mockRejectedValue(new Error('ENOTFOUND'));

      await expect(service().validate(PLUGIN_URL)).resolves.toMatchObject({
        code: ReleaseRejectionCode.URL_UNREACHABLE,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    // The whole reason redirects are followed by hand: a public first hop that bounces
    // into the metadata service would sail through an automatic redirect.
    it('re-checks every redirect hop, not just the first url', async () => {
      route({
        'plugin.example.com': () => redirect('http://169.254.169.254/latest/meta-data/'),
      });

      await expect(service().validate(PLUGIN_URL)).resolves.toMatchObject({
        code: ReleaseRejectionCode.URL_PRIVATE_NETWORK,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('never lets fetch follow redirects on its own', async () => {
      route(okPlugin);

      await service().validate(PLUGIN_URL);

      const [, init] = fetchMock.mock.calls[0];
      expect(init.redirect).toBe('manual');
    });

    it('gives up after the hop limit instead of chasing a redirect loop', async () => {
      route({ 'plugin.example.com': () => redirect('https://plugin.example.com/next') });

      await expect(service().validate(PLUGIN_URL)).resolves.toMatchObject({
        code: ReleaseRejectionCode.URL_UNREACHABLE,
      });
      expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    it('treats a redirect that downgrades to http as not https', async () => {
      route({ 'plugin.example.com': () => redirect('http://elsewhere.example/') });

      await expect(service().validate(PLUGIN_URL)).resolves.toMatchObject({
        code: ReleaseRejectionCode.URL_NOT_HTTPS,
      });
    });

    it('follows a relative redirect location', async () => {
      let hop = 0;
      route({ 'plugin.example.com': () => (hop++ === 0 ? redirect('/app/') : page()) });

      await expect(service().validate(PLUGIN_URL)).resolves.toEqual({
        ok: true,
        finalUrl: 'https://plugin.example.com/app/',
      });
    });
  });

  describe('iframe embeddability', () => {
    it.each([
      ['x-frame-options', 'DENY'],
      ['x-frame-options', 'SAMEORIGIN'],
      ['x-frame-options', 'ALLOW-FROM https://app.owox.com'],
      ['content-security-policy', "frame-ancestors 'none'"],
      ['content-security-policy', "frame-ancestors 'self'"],
      ['content-security-policy', 'frame-ancestors https://other.example'],
      ['content-security-policy', "default-src 'self'; frame-ancestors 'none'"],
    ])('blocks %s: %s', async (header, value) => {
      route({ 'plugin.example.com': () => page({ [header]: value }) });

      await expect(service().validate(PLUGIN_URL)).resolves.toMatchObject({
        code: ReleaseRejectionCode.IFRAME_BLOCKED,
      });
    });

    it.each([
      {},
      { 'content-security-policy': 'frame-ancestors *' },
      { 'content-security-policy': 'frame-ancestors https:' },
      { 'content-security-policy': "default-src 'self'" },
    ])('allows %o', async headers => {
      route({ ...okPlugin, 'plugin.example.com': () => page(headers) });

      await expect(service().validate(PLUGIN_URL)).resolves.toMatchObject({ ok: true });
    });

    it('accepts a vendor that allowlists this deployment by name', async () => {
      route({
        ...okPlugin,
        'plugin.example.com': () =>
          page({ 'content-security-policy': 'frame-ancestors https://app.owox.com' }),
      });

      await expect(
        service({ PUBLIC_ORIGIN: 'https://app.owox.com' }).validate(PLUGIN_URL)
      ).resolves.toMatchObject({ ok: true });
    });

    // A deployment that never set PUBLIC_ORIGIN falls back to localhost, which no real
    // vendor names -- so the refusal still happens, without a second variable to set.
    it('rejects a host allowlist that names a different origin', async () => {
      route({
        'plugin.example.com': () =>
          page({ 'content-security-policy': 'frame-ancestors https://app.owox.com' }),
      });

      await expect(service().validate(PLUGIN_URL)).resolves.toMatchObject({
        code: ReleaseRejectionCode.IFRAME_BLOCKED,
      });
    });
  });
});
