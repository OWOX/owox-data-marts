import type { IdpProvider } from '@owox/idp-protocol';
import type { Express, Request, Response } from 'express';

import { HealthProbeAware } from '@owox/backend';

import { checkReadiness } from './readiness.js';

/**
 * Registers health check routes on the given Express app.
 *
 * Behavior:
 * - /health/live returns 503 until BOTH IDP and backend probe are available; 200 otherwise.
 * - /health/ready returns 503 if shutting down, or if dependencies are missing; otherwise uses checkReadiness.
 */
export function registerHealthRoutes(
  app: Express,
  getIdp: () => IdpProvider | null,
  getBackend: () => HealthProbeAware | null,
  isShuttingDown: () => boolean
): void {
  app.get('/health/live', (_req: Request, res: Response) => res.status(200).json({}));

  app.get('/health/ready', async (_req: Request, res: Response) => {
    if (isShuttingDown()) {
      return res.status(503).json({ reason: 'shutting down' });
    }

    const idp = getIdp();
    if (!idp) {
      return res.status(503).json({ reason: 'IDP not available' });
    }

    const backend = getBackend();
    if (!backend) {
      return res.status(503).json({ reason: 'backend not available' });
    }

    const ok = await checkReadiness(idp, backend);
    return res.status(ok ? 200 : 503).json({ reason: ok ? 'ok' : 'dependencies not healthy' });
  });
}
