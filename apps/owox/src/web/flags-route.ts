import type { Express, Request, Response } from 'express';

import { z } from 'zod';

/**
 * Default HTTP route that exposes selected environment variables
 */
const DEFAULT_PUBLIC_ENV_ROUTE = '/api/flags';

/**
 * Default whitelist of environment variable names to expose.
 * Change this list to add new variables. Keep it minimal for security.
 */
const DEFAULT_PUBLIC_ENV_WHITELIST = [
  'IDP_PROVIDER',
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
  const options: ResolvedOptions = ResolvedOptionsSchema.parse(rawOptions);

  app.get(options.path, (_req: Request, res: Response) => {
    const resultEntries = [...options.whiteSet]
      .map(key => [key, process.env[key]] as const)
      .filter(([, value]) => value !== undefined);

    const payload: Record<string, unknown> = Object.fromEntries(
      resultEntries as Array<readonly [string, unknown]>
    );

    // Do not cache this response; values may change across deploys
    res.setHeader('Cache-Control', 'no-store');
    res.json(payload);
  });
}
