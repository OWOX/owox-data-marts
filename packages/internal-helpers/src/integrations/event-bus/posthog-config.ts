import { BUILT_IN_POSTHOG_API_KEY } from './posthog-key.js';

/** Built-in public key default; empty off a source checkout, injected at release time. */
const DEFAULT_POSTHOG_API_KEY = BUILT_IN_POSTHOG_API_KEY;

/** Default PostHog ingestion host (region must match the project key above). */
const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';

/** Default request timeout for fire-and-forget capture calls. */
const DEFAULT_TIMEOUT_MS = 3000;

export interface PostHogConfig {
  apiKey: string;
  host: string;
  timeoutMs: number;
}

/**
 * Resolve PostHog config from environment variables, falling back to built-in defaults.
 * An empty `apiKey` means telemetry is not configured and callers should not send.
 */
export function resolvePostHogConfig(env: NodeJS.ProcessEnv = process.env): PostHogConfig {
  const apiKey = env.POSTHOG_API_KEY ?? DEFAULT_POSTHOG_API_KEY;
  const rawHost = env.POSTHOG_HOST ?? DEFAULT_POSTHOG_HOST;
  const host = rawHost.replace(/\/+$/, '');
  return { apiKey, host, timeoutMs: DEFAULT_TIMEOUT_MS };
}
