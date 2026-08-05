jest.mock('@owox/internal-helpers', () => ({ fetchWithBackoff: jest.fn() }));

import { ConfigService } from '@nestjs/config';
import { fetchWithBackoff } from '@owox/internal-helpers';
import { PluginHostConfigService } from '../config/plugin-host.config';
import { GithubAccessMode } from '../enums/github-access-mode.enum';
import { GithubApiError, GithubRepoNotFoundError } from '../errors/plugin-host.errors';
import { GithubApiService } from './github-api.service';
import { GithubAuthService } from './github-auth.service';

const fetchMock = fetchWithBackoff as jest.Mock;
const REF = { owner: 'OWOX', name: 'example-plugin' };

function service(env: Record<string, string | undefined> = {}): GithubApiService {
  const config = new PluginHostConfigService({
    get: <T>(key: string) => env[key] as T,
  } as ConfigService);

  const auth = {
    getRepoAccess: jest.fn().mockResolvedValue({
      mode: GithubAccessMode.ANONYMOUS,
      headers: { Accept: 'application/vnd.github+json' },
    }),
    buildInstallationUrl: jest.fn(() =>
      env.GITHUB_APP_SLUG
        ? `https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new`
        : null
    ),
  } as unknown as GithubAuthService;

  return new GithubApiService(auth, config);
}

function route(routes: Record<string, () => Response>) {
  fetchMock.mockImplementation((url: string) => {
    const match = Object.keys(routes).find(fragment => String(url).includes(fragment));
    if (!match) {
      throw new Error(`unexpected fetch: ${url}`);
    }
    return Promise.resolve(routes[match]());
  });
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });

const text = (body: string) => new Response(body, { status: 200 });
const status = (code: number, headers: Record<string, string> = {}) =>
  new Response(null, { status: code, headers });

const repoBody = {
  id: 987654321,
  owner: { login: 'OWOX' },
  name: 'example-plugin',
  private: false,
  html_url: 'https://github.com/OWOX/example-plugin',
};

const APP_ENV = {
  GITHUB_APP_ID: '1',
  GITHUB_APP_SLUG: 'owox',
  GITHUB_APP_PRIVATE_KEY: 'k',
};

describe('GithubApiService', () => {
  beforeEach(() => fetchMock.mockReset());

  describe('getRepo', () => {
    it('returns the numeric id as a string, since it is the identity anchor', async () => {
      route({ '/repos/OWOX/example-plugin': () => json(repoBody) });

      await expect(service().getRepo(REF)).resolves.toMatchObject({
        githubRepoId: '987654321',
        owner: 'OWOX',
        name: 'example-plugin',
        isPrivate: false,
        accessMode: GithubAccessMode.ANONYMOUS,
      });
    });

    // Renames and transfers answer 301, and following it is what makes a stale locator
    // resolve to the same plugin instead of creating a second one.
    it('follows redirects so a renamed repository keeps its identity', async () => {
      route({ '/repos/OWOX/example-plugin': () => json({ ...repoBody, name: 'renamed' }) });

      await service().getRepo(REF);

      const [, init] = fetchMock.mock.calls[0];
      expect(init.redirect ?? 'follow').toBe('follow');
    });

    it('offers an actionable installation url when the App exists but cannot read the repo', async () => {
      route({ '/repos/OWOX/example-plugin': () => status(404) });

      await expect(service(APP_ENV).getRepo(REF)).rejects.toMatchObject({
        code: 'GITHUB_REPO_NOT_ACCESSIBLE',
        errorDetails: { installationUrl: 'https://github.com/apps/owox/installations/new' },
      });
    });

    it('reports a plain not-found when there is no App to install', async () => {
      route({ '/repos/OWOX/example-plugin': () => status(404) });

      await expect(service().getRepo(REF)).rejects.toBeInstanceOf(GithubRepoNotFoundError);
    });

    it('surfaces the rate limit reset time instead of a generic failure', async () => {
      route({
        '/repos/OWOX/example-plugin': () =>
          status(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1800000000' }),
      });

      await expect(service().getRepo(REF)).rejects.toMatchObject({
        code: 'GITHUB_RATE_LIMITED',
        errorDetails: { retryAt: new Date(1_800_000_000_000).toISOString() },
      });
    });

    // The publisher's next move depends on which mode ran out: an anonymous read
    // exhausts far sooner than an App installation, so reporting the wrong one sends
    // them to fix the wrong thing.
    it('reports the access mode that actually ran out', async () => {
      const api = service();
      (
        api as unknown as { auth: { getRepoAccess: jest.Mock } }
      ).auth.getRepoAccess.mockResolvedValue({
        mode: GithubAccessMode.APP,
        headers: {},
      });
      route({
        '/repos/OWOX/example-plugin': () =>
          status(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1800000000' }),
      });

      await expect(api.getRepo(REF)).rejects.toMatchObject({
        errorDetails: { accessMode: GithubAccessMode.APP },
      });
    });

    it('treats a 403 that is not a rate limit as an api error', async () => {
      route({ '/repos/OWOX/example-plugin': () => status(403) });

      await expect(service().getRepo(REF)).rejects.toBeInstanceOf(GithubApiError);
    });
  });

  describe('listReleases', () => {
    const release = (id: number, tag: string) => ({
      id,
      tag_name: tag,
      draft: false,
      prerelease: false,
      published_at: '2026-07-01T00:00:00Z',
    });

    it('maps the fields eligibility depends on', async () => {
      route({
        '/releases': () =>
          json([{ ...release(7, 'v1.0.0'), draft: true, prerelease: true, published_at: null }]),
      });

      await expect(service().listReleases(REF)).resolves.toEqual([
        {
          githubReleaseId: '7',
          tagName: 'v1.0.0',
          isDraft: true,
          isPrerelease: true,
          publishedAt: null,
        },
      ]);
    });

    it('stops paging as soon as a page is short', async () => {
      route({ '/releases': () => json([release(1, 'v1.0.0')]) });

      await service().listReleases(REF);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    // One page, and not configurable: a sync stops at the newest release that validates,
    // so a second page could only hold versions that cannot become current.
    it('never pages past the cap', async () => {
      const full = Array.from({ length: 100 }, (_, i) => release(i, `v1.0.${i}`));
      route({ '/releases': () => json(full) });

      const releases = await service().listReleases(REF);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(releases).toHaveLength(100);
    });
  });

  describe('resolveCommitSha', () => {
    // One call, and it dereferences annotated tags -- /git/ref/tags needs a second hop.
    it('reads the commit endpoint so annotated tags resolve in one request', async () => {
      route({ '/commits/v1.2.3': () => json({ sha: 'abc123' }) });

      await expect(service().resolveCommitSha(REF, 'v1.2.3')).resolves.toBe('abc123');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('returns null for a tag that no longer resolves', async () => {
      route({ '/commits/': () => status(404) });

      await expect(service().resolveCommitSha(REF, 'v9.9.9')).resolves.toBeNull();
    });

    it('encodes tags containing slashes', async () => {
      route({ '/commits/': () => json({ sha: 'abc123' }) });

      await service().resolveCommitSha(REF, 'release/1.2.3');

      expect(String(fetchMock.mock.calls[0][0])).toContain('release%2F1.2.3');
    });
  });

  describe('getFileAtCommit', () => {
    it('pins the read to the commit, not a branch', async () => {
      route({ '/contents/plugin.json': () => text('{"name":"x"}') });

      await expect(service().getFileAtCommit(REF, 'plugin.json', 'abc123')).resolves.toBe(
        '{"name":"x"}'
      );
      expect(String(fetchMock.mock.calls[0][0])).toContain('ref=abc123');
    });

    it('asks for the raw body rather than base64 json', async () => {
      route({ '/contents/plugin.json': () => text('{}') });

      await service().getFileAtCommit(REF, 'plugin.json', 'abc123');

      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers.Accept).toBe('application/vnd.github.raw');
    });

    it('returns null when the file is absent at that commit', async () => {
      route({ '/contents/plugin.json': () => status(404) });

      await expect(service().getFileAtCommit(REF, 'plugin.json', 'abc123')).resolves.toBeNull();
    });

    // Null, not a throw: the caller turns it into MANIFEST_MISSING for this one release
    // rather than losing every other candidate in the same sync.
    it('refuses an implausibly large manifest instead of buffering it', async () => {
      route({
        '/contents/plugin.json': () =>
          new Response('{}', {
            status: 200,
            headers: { 'content-length': String(2 * 1024 * 1024) },
          }),
      });

      await expect(service().getFileAtCommit(REF, 'plugin.json', 'abc123')).resolves.toBeNull();
    });

    it('refuses an oversized body that declares no content-length', async () => {
      const oversized = 'x'.repeat(1024 * 1024 + 1);
      route({
        '/contents/plugin.json': () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode(oversized));
                controller.close();
              },
            })
          ),
      });

      await expect(service().getFileAtCommit(REF, 'plugin.json', 'abc123')).resolves.toBeNull();
    });
  });
});
