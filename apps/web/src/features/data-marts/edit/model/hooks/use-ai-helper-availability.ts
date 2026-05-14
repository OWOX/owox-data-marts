import { useEffect, useState } from 'react';
import { dataMartService } from '../../../shared';

let cachedAvailability: boolean | null = null;
let inflight: Promise<boolean> | null = null;

/**
 * Returns whether AI helper is configured on this deployment.
 *
 * The flag is global (env-var driven on the backend) and immutable for the
 * session, so the result is cached process-wide after the first fetch.
 *
 * `null` while the first request is in flight — components should hide the
 * AI buttons in that intermediate state to avoid a flash.
 */
export function useAiHelperAvailability(): { enabled: boolean | null } {
  const [enabled, setEnabled] = useState<boolean | null>(cachedAvailability);

  useEffect(() => {
    if (cachedAvailability !== null) return;

    let cancelled = false;
    inflight ??= dataMartService
      .getAiHelperAvailability()
      .then(response => {
        cachedAvailability = response.enabled;
        return response.enabled;
      })
      .catch(() => {
        cachedAvailability = false;
        return false;
      })
      .finally(() => {
        inflight = null;
      });

    void inflight.then(result => {
      if (!cancelled) {
        setEnabled(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return { enabled };
}
