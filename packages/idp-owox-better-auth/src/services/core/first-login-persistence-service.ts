import type { Payload } from '@owox/idp-protocol';
import { createServiceLogger } from '../../core/logger.js';
import type { OwoxTokenFacade } from '../../facades/owox-token-facade.js';
import type { DatabaseStore } from '../../store/database-store.js';
import type { DatabaseUser } from '../../types/database-models.js';

/**
 * Extracts first login information from token payload.
 * Maps token fields to database fields:
 * - userId (token) -> biUserId (database)
 * - signinProvider (token) -> firstLoginMethod (database)
 */
interface FirstLoginInfo {
  biUserId: string | undefined;
  firstLoginMethod: string | undefined;
}

/**
 * Responsible for persisting first-time login information to the database.
 * This service handles one-time initialization of firstLoginMethod and biUserId
 * fields when a user authenticates for the first time.
 */
export class FirstLoginPersistenceService {
  private readonly logger = createServiceLogger(FirstLoginPersistenceService.name);

  constructor(
    private readonly store: DatabaseStore,
    private readonly tokenFacade: OwoxTokenFacade
  ) {}

  /**
   * Persists first login method and BI user ID from access token to the database.
   * Only updates if the fields are not already set (one-time initialization).
   * Also updates lastLoginMethod every time (tracks most recent login method).
   *
   * @param accessToken - The access token to extract information from
   */
  async persistFirstLoginInfo(accessToken: string): Promise<void> {
    try {
      const payload = await this.tokenFacade.parseToken(accessToken);
      if (!payload?.email) {
        this.logger.warn('Cannot persist first login info: email missing from token payload');
        return;
      }

      const loginInfo = this.extractFirstLoginInfo(payload);
      if (!loginInfo.biUserId && !loginInfo.firstLoginMethod) {
        this.logger.debug('No first login info to persist in token payload');
        return;
      }

      const user = await this.store.getUserByEmail(payload.email);
      if (!user) {
        this.logger.warn('Cannot persist first login info: user not found in DB', {
          email: payload.email,
        });
        return;
      }

      await Promise.all([
        this.updateUserFirstLoginInfo(user, loginInfo),
        this.updateUserLastLoginInfo(user, loginInfo),
      ]);
    } catch (error) {
      this.logger.warn(
        'Failed to persist first login info',
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Extracts first login information from token payload.
   * Maps token field names to database field names:
   * - userId (token) -> biUserId (database)
   * - signinProvider (token) -> firstLoginMethod (database)
   */
  private extractFirstLoginInfo(payload: Payload): FirstLoginInfo {
    // Access extra fields via dynamic property access
    const extendedPayload = payload as Record<string, unknown>;

    const biUserId = extendedPayload['userId'];
    const firstLoginMethod = extendedPayload['signinProvider'];

    return {
      // userId in token maps to biUserId in database
      biUserId: typeof biUserId === 'string' ? biUserId : undefined,
      // signinProvider in token maps to firstLoginMethod in database
      firstLoginMethod: typeof firstLoginMethod === 'string' ? firstLoginMethod : undefined,
    };
  }

  /**
   * Updates user's first login information in the database.
   * Only updates fields that are not already set.
   */
  private async updateUserFirstLoginInfo(
    user: DatabaseUser,
    loginInfo: FirstLoginInfo
  ): Promise<void> {
    const updates: Promise<void>[] = [];

    if (loginInfo.firstLoginMethod && !user.firstLoginMethod) {
      const updatePromise = this.store.updateUserFirstLoginMethod(
        user.id,
        loginInfo.firstLoginMethod
      );
      // Handle both Promise and non-Promise returns (for tests)
      if (updatePromise && typeof updatePromise.then === 'function') {
        updates.push(
          updatePromise.then(() => {
            this.logger.debug('Persisted firstLoginMethod for user', {
              userId: user.id,
              firstLoginMethod: loginInfo.firstLoginMethod,
            });
          })
        );
      } else {
        updates.push(Promise.resolve());
      }
    }

    if (loginInfo.biUserId && !user.biUserId) {
      const updatePromise = this.store.updateUserBiUserId(user.id, loginInfo.biUserId);
      // Handle both Promise and non-Promise returns (for tests)
      if (updatePromise && typeof updatePromise.then === 'function') {
        updates.push(
          updatePromise.then(() => {
            this.logger.debug('Persisted biUserId for user', {
              userId: user.id,
              biUserId: loginInfo.biUserId,
            });
          })
        );
      } else {
        updates.push(Promise.resolve());
      }
    }

    await Promise.all(updates);
  }

  /**
   * Updates user's last login method in the database.
   * Updates every time (unlike firstLoginMethod which only sets once).
   */
  private async updateUserLastLoginInfo(
    user: DatabaseUser,
    loginInfo: FirstLoginInfo
  ): Promise<void> {
    if (!loginInfo.firstLoginMethod) {
      return;
    }

    try {
      const updatePromise = this.store.updateUserLastLoginMethod(
        user.id,
        loginInfo.firstLoginMethod
      );
      // Handle both Promise and non-Promise returns (for tests)
      if (updatePromise && typeof updatePromise.then === 'function') {
        await updatePromise;
        this.logger.debug('Persisted lastLoginMethod for user', {
          userId: user.id,
          lastLoginMethod: loginInfo.firstLoginMethod,
        });
      }
    } catch (error) {
      this.logger.warn(
        'Failed to persist lastLoginMethod',
        { userId: user.id, lastLoginMethod: loginInfo.firstLoginMethod },
        error instanceof Error ? error : undefined
      );
    }
  }
}
