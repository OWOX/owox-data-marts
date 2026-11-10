import type { Logger } from '@owox/internal-helpers';
import type { DatabaseStore } from '../../store/database-store.js';

/**
 * Email of a user from the local user record, looked up by their BI user ID.
 * Returns `undefined` when there is no record or the lookup fails, so callers
 * can try their own fallback. Never throws.
 */
export async function findLocalUserEmail(
  store: DatabaseStore,
  biUserId: string,
  logger: Logger,
  logContext: Record<string, unknown>
): Promise<string | undefined> {
  try {
    const user = await store.getUserByBiUserId(biUserId);
    return user?.email || undefined;
  } catch (error) {
    logger.warn('Could not load the user email from the local store', logContext, error);
    return undefined;
  }
}
