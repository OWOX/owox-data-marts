/**
 * Built-in public PostHog project key. EMPTY in git by design.
 *
 * The release pipeline rewrites this file from the POSTHOG_API_KEY secret immediately before
 * `npm publish` (see scripts/inject-posthog-key.mjs). The injected value is never committed.
 * Local and dev builds keep the empty string, so telemetry stays silent off a source checkout.
 *
 * PostHog project ("write") keys are designed to be embedded in clients; injecting it here is
 * safe. While empty, callers treat telemetry as unconfigured (no-op).
 */
export const BUILT_IN_POSTHOG_API_KEY = '';
