import { ConfigService } from '@nestjs/config';
import { validateConfig } from '../../config/env-validation.config';
import { PluginHostConfigService } from './plugin-host.config';

// Deliberately `unknown`, not `string`: the boot-time schema coerces numeric settings,
// so ConfigService really does hand back non-strings. A string-only fixture would make
// that whole class of mismatch invisible here.
const config = (env: Record<string, unknown>) =>
  new PluginHostConfigService({
    get: <T>(key: string) => env[key] as T,
  } as ConfigService);

describe('PluginHostConfigService', () => {
  describe('deploymentPublisherApiKeyIds', () => {
    it('is empty when the allowlist is unset', () => {
      expect(config({}).deploymentPublisherApiKeyIds).toEqual([]);
    });

    it('is empty for an empty string', () => {
      expect(
        config({ OWOX_DEPLOYMENT_PLUGIN_PUBLISHER_API_KEY_IDS: '' }).deploymentPublisherApiKeyIds
      ).toEqual([]);
    });

    it('trims entries and drops empty ones', () => {
      expect(
        config({ OWOX_DEPLOYMENT_PLUGIN_PUBLISHER_API_KEY_IDS: ' key-1 , ,key-2, ' })
          .deploymentPublisherApiKeyIds
      ).toEqual(['key-1', 'key-2']);
    });

    // An empty allowlist must deny everyone rather than allow everyone -- the
    // authorization service depends on this being a closed list.
    it('never yields a wildcard entry', () => {
      expect(
        config({ OWOX_DEPLOYMENT_PLUGIN_PUBLISHER_API_KEY_IDS: '   ' }).deploymentPublisherApiKeyIds
      ).toEqual([]);
    });
  });

  describe('github access', () => {
    it('requires all three app credentials before app mode counts as configured', () => {
      expect(config({ GITHUB_APP_ID: '1', GITHUB_APP_SLUG: 'owox' }).isAppModeConfigured).toBe(
        false
      );
      expect(
        config({ GITHUB_APP_ID: '1', GITHUB_APP_SLUG: 'owox', GITHUB_APP_PRIVATE_KEY: 'k' })
          .isAppModeConfigured
      ).toBe(true);
    });

    it('unescapes newlines in a private key supplied as a single-line env var', () => {
      const key = config({
        GITHUB_APP_PRIVATE_KEY: '-----BEGIN-----\\nabc\\n-----END-----',
      }).githubAppPrivateKey;

      expect(key).toBe('-----BEGIN-----\nabc\n-----END-----');
    });

    it('defaults the api base url and allows overriding it for tests', () => {
      expect(config({}).githubApiBaseUrl).toBe('https://api.github.com');
      expect(config({ GITHUB_API_BASE_URL: 'https://ghe.internal/api/v3' }).githubApiBaseUrl).toBe(
        'https://ghe.internal/api/v3'
      );
    });

    it('treats a blank token as absent', () => {
      expect(config({ GITHUB_TOKEN: '   ' }).githubToken).toBeUndefined();
      expect(config({ GITHUB_TOKEN: 'ghp_x' }).githubToken).toBe('ghp_x');
    });
  });

  describe('sync and probe tuning', () => {
    it('falls back to defaults when the env vars are absent', () => {
      const defaults = config({});

      expect(defaults.syncMinIntervalMs).toBe(300_000);
      expect(defaults.maxReleasePages).toBe(1);
      expect(defaults.remoteProbeTimeoutMs).toBe(8_000);
      expect(defaults.maxRedirectHops).toBe(5);
    });

    it('reads validated values from the environment', () => {
      const tuned = config({
        PLUGIN_HOST_SYNC_MIN_INTERVAL_SEC: '60',
        PLUGIN_HOST_MAX_RELEASE_PAGES: '2',
        PLUGIN_HOST_REMOTE_PROBE_TIMEOUT_MS: '2000',
      });

      expect(tuned.syncMinIntervalMs).toBe(60_000);
      expect(tuned.maxReleasePages).toBe(2);
      expect(tuned.remoteProbeTimeoutMs).toBe(2_000);
    });

    /**
     * Through the real schema rather than a hand-written stand-in.
     *
     * validateConfig coerces these three to numbers, so a service that assumed strings
     * threw on the first publish while every string-fed unit test stayed green. Running
     * the actual validator is what makes the two layers agree by test rather than by luck.
     */
    it.each([
      ['with values supplied', { PLUGIN_HOST_SYNC_MIN_INTERVAL_SEC: '60' }, 60_000],
      ['on schema defaults', {}, 300_000],
    ])('survives boot-time coercion %s', (_label, env, expected) => {
      const validated = config(validateConfig(env));

      expect(validated.syncMinIntervalMs).toBe(expected);
      expect(validated.maxReleasePages).toBe(1);
      expect(validated.remoteProbeTimeoutMs).toBe(8_000);
    });
  });

  describe('publicOrigin', () => {
    it('is undefined when unset, so frame-ancestors allowlists cannot be matched', () => {
      expect(config({}).publicOrigin).toBeUndefined();
    });

    it('normalizes to a bare origin', () => {
      expect(config({ PLUGIN_HOST_PUBLIC_ORIGIN: 'https://app.owox.com/' }).publicOrigin).toBe(
        'https://app.owox.com'
      );
    });

    it('ignores a malformed origin rather than throwing at startup', () => {
      expect(config({ PLUGIN_HOST_PUBLIC_ORIGIN: 'not a url' }).publicOrigin).toBeUndefined();
    });
  });
});
