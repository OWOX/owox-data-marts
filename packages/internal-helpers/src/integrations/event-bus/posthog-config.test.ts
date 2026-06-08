import { resolvePostHogConfig } from './posthog-config.js';

describe('resolvePostHogConfig', () => {
  it('uses env overrides when provided', () => {
    const config = resolvePostHogConfig({
      POSTHOG_API_KEY: 'phc_env',
      POSTHOG_HOST: 'https://us.i.posthog.com',
    });
    expect(config.apiKey).toBe('phc_env');
    expect(config.host).toBe('https://us.i.posthog.com');
    expect(config.timeoutMs).toBe(3000);
  });

  it('falls back to the built-in host default', () => {
    const config = resolvePostHogConfig({});
    expect(config.host).toBe('https://eu.i.posthog.com');
  });

  it('trims a trailing slash from host', () => {
    const config = resolvePostHogConfig({ POSTHOG_HOST: 'https://eu.i.posthog.com/' });
    expect(config.host).toBe('https://eu.i.posthog.com');
  });
});
