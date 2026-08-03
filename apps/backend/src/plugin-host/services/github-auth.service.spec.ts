jest.mock('@owox/internal-helpers', () => ({ fetchWithBackoff: jest.fn() }));
jest.mock('jsonwebtoken', () => ({ sign: jest.fn(() => 'app-jwt') }));

import { ConfigService } from '@nestjs/config';
import { fetchWithBackoff } from '@owox/internal-helpers';
import * as jwt from 'jsonwebtoken';
import { PluginHostConfigService } from '../config/plugin-host.config';
import { GithubAccessMode } from '../enums/github-access-mode.enum';
import { GithubAuthConfigError } from '../errors/plugin-host.errors';
import { GithubAuthService } from './github-auth.service';

const fetchMock = fetchWithBackoff as jest.Mock;
const signMock = jwt.sign as unknown as jest.Mock;

const REF = { owner: 'OWOX', name: 'example-plugin' };

const APP_ENV = {
  GITHUB_APP_ID: '12345',
  GITHUB_APP_SLUG: 'owox',
  GITHUB_APP_PRIVATE_KEY: '-----BEGIN RSA PRIVATE KEY-----\\nkey\\n-----END RSA PRIVATE KEY-----',
};

function service(env: Record<string, string | undefined>): GithubAuthService {
  const config = new PluginHostConfigService({
    get: <T>(key: string) => env[key] as T,
  } as ConfigService);

  return new GithubAuthService(config);
}

/** Answers by URL suffix so an unexpected call fails loudly instead of silently matching. */
function route(routes: Record<string, () => Response>) {
  fetchMock.mockImplementation((url: string) => {
    const match = Object.keys(routes).find(suffix => url.endsWith(suffix));
    if (!match) {
      throw new Error(`unexpected fetch: ${url}`);
    }
    return Promise.resolve(routes[match]());
  });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const status = (code: number) => new Response(null, { status: code });

const inOneHour = () => new Date(Date.now() + 3_600_000).toISOString();

describe('GithubAuthService', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    signMock.mockClear();
    signMock.mockReturnValue('app-jwt');
  });

  describe('access mode priority', () => {
    it('uses an App installation token when the App is installed on the repository', async () => {
      route({
        '/repos/OWOX/example-plugin/installation': () => json({ id: 42 }),
        '/app/installations/42/access_tokens': () =>
          json({ token: 'ghs_installation', expires_at: inOneHour() }, 201),
      });

      const access = await service(APP_ENV).getRepoAccess(REF);

      expect(access.mode).toBe(GithubAccessMode.APP);
      expect(access.headers.Authorization).toBe('Bearer ghs_installation');
    });

    // A public repository must still sync when the App exists but was never installed
    // on it -- that is the whole point of supporting public third-party repositories.
    it('falls through to the server token when the App is not installed on this repository', async () => {
      route({ '/repos/OWOX/example-plugin/installation': () => status(404) });

      const access = await service({ ...APP_ENV, GITHUB_TOKEN: 'ghp_server' }).getRepoAccess(REF);

      expect(access.mode).toBe(GithubAccessMode.SERVER_TOKEN);
      expect(access.headers.Authorization).toBe('Bearer ghp_server');
    });

    it('falls through to anonymous when the App is not installed and no token is configured', async () => {
      route({ '/repos/OWOX/example-plugin/installation': () => status(404) });

      const access = await service(APP_ENV).getRepoAccess(REF);

      expect(access.mode).toBe(GithubAccessMode.ANONYMOUS);
      expect(access.headers.Authorization).toBeUndefined();
    });

    it('uses the server token without calling GitHub when the App is not configured', async () => {
      const access = await service({ GITHUB_TOKEN: 'ghp_server' }).getRepoAccess(REF);

      expect(access.mode).toBe(GithubAccessMode.SERVER_TOKEN);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('is anonymous when nothing at all is configured', async () => {
      const access = await service({}).getRepoAccess(REF);

      expect(access.mode).toBe(GithubAccessMode.ANONYMOUS);
      expect(access.headers.Authorization).toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('installation token cache', () => {
    it('mints once for repeated reads of the same installation', async () => {
      route({
        '/repos/OWOX/example-plugin/installation': () => json({ id: 42 }),
        '/app/installations/42/access_tokens': () =>
          json({ token: 'ghs_installation', expires_at: inOneHour() }, 201),
      });
      const auth = service(APP_ENV);

      await auth.getRepoAccess(REF);
      await auth.getRepoAccess(REF);

      const mints = fetchMock.mock.calls.filter(([url]: [string]) =>
        String(url).endsWith('/access_tokens')
      );
      expect(mints).toHaveLength(1);
    });

    it('re-mints once the cached token is close to expiry', async () => {
      route({
        '/repos/OWOX/example-plugin/installation': () => json({ id: 42 }),
        '/app/installations/42/access_tokens': () =>
          json(
            { token: 'ghs_installation', expires_at: new Date(Date.now() + 10_000).toISOString() },
            201
          ),
      });
      const auth = service(APP_ENV);

      await auth.getRepoAccess(REF);
      await auth.getRepoAccess(REF);

      const mints = fetchMock.mock.calls.filter(([url]: [string]) =>
        String(url).endsWith('/access_tokens')
      );
      expect(mints).toHaveLength(2);
    });
  });

  describe('app jwt', () => {
    it('signs with RS256 and a short window that tolerates clock skew', async () => {
      route({ '/repos/OWOX/example-plugin/installation': () => status(404) });

      await service(APP_ENV).getRepoAccess(REF);

      const [payload, key, options] = signMock.mock.calls[0];
      expect(payload).toMatchObject({ iss: '12345' });
      expect(payload.iat).toBeLessThan(payload.exp);
      // GitHub rejects an App JWT older than 10 minutes.
      expect(payload.exp - payload.iat).toBeLessThanOrEqual(600);
      expect(key).toContain('BEGIN RSA PRIVATE KEY');
      expect(key).toContain('\n');
      expect(options).toMatchObject({ algorithm: 'RS256' });
    });

    it('reports a misconfigured private key rather than failing as a network error', async () => {
      signMock.mockImplementation(() => {
        throw new Error('secretOrPrivateKey must be an asymmetric key');
      });

      await expect(service(APP_ENV).getRepoAccess(REF)).rejects.toBeInstanceOf(
        GithubAuthConfigError
      );
    });
  });

  describe('buildInstallationUrl', () => {
    it('points at the app installation page when App mode is configured', () => {
      expect(service(APP_ENV).buildInstallationUrl()).toBe(
        'https://github.com/apps/owox/installations/new'
      );
    });

    it('is null without App mode, so callers cannot offer a link that does not exist', () => {
      expect(service({}).buildInstallationUrl()).toBeNull();
    });
  });
});
