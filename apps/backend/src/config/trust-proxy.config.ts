import type { Express } from 'express';
import { trustProxyHopsSchema } from './env-validation.config';

/**
 * Sets Express `trust proxy` to the number of reverse proxies in front of the app
 * (TRUST_PROXY_HOPS, default 1). Express then takes `req.ip` that many entries from
 * the right of X-Forwarded-For, the entries those proxies appended. Runs before
 * bootstrap, so it validates the value itself and stops the app on a bad one.
 */
export function configureTrustProxy(app: Express, env: NodeJS.ProcessEnv = process.env): void {
  const hops = trustProxyHopsSchema.safeParse(env.TRUST_PROXY_HOPS);
  if (!hops.success) {
    throw new Error(
      `TRUST_PROXY_HOPS must be a whole number from 0 to 10, got "${env.TRUST_PROXY_HOPS}"`
    );
  }
  app.set('trust proxy', hops.data);
}
