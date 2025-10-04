import type { IdpProvider } from '@owox/idp-protocol';

import { HealthProbeAware } from '@owox/backend';
import { withTimeout } from '@owox/internal-helpers';

const HEALTHCHECK_TIMEOUT_MS = 500;

/**
 * Aggregate readiness check for the web layer.
 *
 * Returns true only if both the IDP and backend report healthy status.
 * Errors and timeouts (> HEALTHCHECK_TIMEOUT_MS) are treated as unhealthy to keep the behavior conservative.
 */
export async function checkReadiness(
  idp: IdpProvider,
  backend: HealthProbeAware
): Promise<boolean> {
  // Start both checks concurrently and enforce a strict timeout for each.
  // If a check errors or exceeds the timeout, we treat it as unhealthy (false).
  const idpHealthyPromise = withTimeout<boolean>(
    idp.isHealthy(),
    HEALTHCHECK_TIMEOUT_MS,
    false
  ).catch(() => false);
  const backendHealthyPromise = withTimeout<boolean>(
    backend.isHealthy(),
    HEALTHCHECK_TIMEOUT_MS,
    false
  ).catch(() => false);

  const [idpHealthy, backendHealthy] = await Promise.all([
    idpHealthyPromise,
    backendHealthyPromise,
  ]);

  return idpHealthy && backendHealthy;
}
