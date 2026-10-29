import type { Express } from 'express';

const DEFAULT_TRUST_PROXY_HOPS = 1;

/**
 * Sets Express `trust proxy` to the number of reverse proxies in front of the app
 * (TRUST_PROXY_HOPS, default 1). Express then takes `req.ip` that many entries from
 * the right of X-Forwarded-For, the entries those proxies appended. Only a whole
 * number is accepted: `true` or an address list would let a client choose its own
 * `req.ip` through a forged X-Forwarded-For.
 */
export function configureTrustProxy(app: Express, env: NodeJS.ProcessEnv = process.env): void {
  const raw = env.TRUST_PROXY_HOPS?.trim();
  if (raw && !/^\d+$/.test(raw)) {
    throw new Error(`TRUST_PROXY_HOPS must be a whole number of proxies, got "${raw}"`);
  }
  app.set('trust proxy', raw ? Number(raw) : DEFAULT_TRUST_PROXY_HOPS);
}
