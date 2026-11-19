import type { Express, Request, Response } from 'express';

import { z } from 'zod';

import { resolvePublicOrigin } from '../utils/public-origin.js';

/**
 * Default HTTP route that exposes selected environment variables
 */
const DEFAULT_PUBLIC_ENV_ROUTE = '/api/flags';

/**
 * Default whitelist of environment variable names to expose.
 * Change this list to add new variables. Keep it minimal for security.
 */
const DEFAULT_PUBLIC_ENV_WHITELIST = [
  'LICENSED_APP_EDITION',
  'LICENSE_ISSUANCE_ENABLED',
  'IDP_PROVIDER',
  'CLOUD_BILLING_ENABLED',
  'CLOUD_BILLING_API_ORIGIN',
  'MENU_GITHUB_COMMUNITY_VISIBLE',
  'MENU_UPGRADE_OPTIONS_VISIBLE',
  'MENU_FEEDBACK_VISIBLE',
  'MENU_ISSUES_VISIBLE',
  'MENU_LICENSE_VISIBLE',
  'MENU_OWOX_BI_VISIBLE',
  'MENU_DOCUMENTATION_OWOX_CLOUD_VISIBLE',
  'MENU_DOCUMENTATION_COMMUNITY_EDITION_VISIBLE',
  'GOOGLE_TAG_MANAGER_CONTAINER_ID',
  'INTERCOM_APP_ID',
  'INSIGHTS_ENABLED',
  'INSIGHT_ASSISTANT_ENABLED_PROJECT_IDS',
  // The running version, so the app announces only releases it already contains.
  'APP_OWOX_VERSION',
] as const;

/**
 * Options for registering the public environment route
 */
export interface FlagsRouteOptions {
  /** Custom route path (must start with '/'), default: '/flags' */
  path?: string;
  /** Explicit whitelist of environment variable names to expose */
  whitelist?: string[];
}

/**
 * Schema to validate the options passed to the route registrar
 */
const EnvKeySchema = z.string().min(1);
const WhitelistSchema = z.array(EnvKeySchema);

const OptionsBaseSchema = z.object({
  path: z
    .string()
    .min(1)
    .refine(v => v.startsWith('/'), { message: 'path must start with /' })
    .default(DEFAULT_PUBLIC_ENV_ROUTE),
  whitelist: WhitelistSchema.optional(),
});

// Resolve whitelist and prepare a Set for faster lookup via Zod transform
const ResolvedOptionsSchema = OptionsBaseSchema.transform(data => {
  const whitelist =
    data.whitelist && data.whitelist.length > 0
      ? WhitelistSchema.parse(data.whitelist)
      : [...DEFAULT_PUBLIC_ENV_WHITELIST];

  return {
    path: data.path,
    whitelist,
    whiteSet: new Set(whitelist),
  };
});

type ResolvedOptions = z.infer<typeof ResolvedOptionsSchema>;

function validateCloudBillingConfig(): void {
  if (process.env.CLOUD_BILLING_ENABLED !== 'true') {
    return;
  }

  const value = process.env.CLOUD_BILLING_API_ORIGIN ?? '';
  const url = URL.parse(value);
  if (url?.protocol !== 'https:' || (value !== url.origin && value !== `${url.origin}/`)) {
    throw new Error(
      'CLOUD_BILLING_API_ORIGIN must be an HTTPS origin when CLOUD_BILLING_ENABLED=true'
    );
  }
}

/**
 * Register an Express route that exposes selected environment variables as JSON.
 *
 * This is useful for exposing feature flags or configuration options to client-side code.
 * Only variables explicitly listed in the whitelist will be exposed.
 *
 * @param app - Express application instance
 * @param rawOptions - Configuration options for the route
 *
 * Response example:
 * GET /flags -> { "APP_VERSION": "1.2.3" }
 */
export function registerPublicFlagsRoute(app: Express, rawOptions: FlagsRouteOptions = {}): void {
  const accountApiOrigin =
    process.env.IDP_PROVIDER === 'owox-better-auth'
      ? process.env.CLOUD_ACCOUNT_API_ORIGIN?.trim()
      : undefined;
  const accountApiUrl = accountApiOrigin ? URL.parse(accountApiOrigin) : null;
  if (
    accountApiOrigin &&
    (accountApiUrl?.protocol !== 'https:' ||
      (accountApiOrigin !== accountApiUrl.origin &&
        accountApiOrigin !== `${accountApiUrl.origin}/`))
  ) {
    throw new Error('CLOUD_ACCOUNT_API_ORIGIN must be an HTTPS origin');
  }
  const options: ResolvedOptions = ResolvedOptionsSchema.parse(rawOptions);
  validateCloudBillingConfig();

  app.get(options.path, (_req: Request, res: Response) => {
    const resultEntries = [...options.whiteSet]
      .map(key => [key, process.env[key]] as const)
      .filter(([, value]) => value !== undefined);

    const payload: Record<string, unknown> = Object.fromEntries(
      resultEntries as Array<readonly [string, unknown]>
    );
    payload.PUBLIC_ORIGIN = resolvePublicOrigin();

    // Do not cache this response; values may change across deploys
    res.setHeader('Cache-Control', 'no-store');
    if (accountApiUrl) {
      payload.CLOUD_ACCOUNT_API_ORIGIN = accountApiUrl.origin;
    }
    res.json(payload);
  });
}
