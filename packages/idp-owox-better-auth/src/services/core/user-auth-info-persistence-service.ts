import type { Payload } from '@owox/idp-protocol';
import { createServiceLogger } from '../../core/logger.js';
import type { OwoxTokenFacade } from '../../facades/owox-token-facade.js';
import type { DatabaseStore } from '../../store/database-store.js';
import type { DatabaseUser } from '../../types/database-models.js';

/**
 * Extracts authentication information from token payload.
 * Maps token fields to database fields:
 * - userId (token) -> biUserId (database)
 * - signinProvider (token) -> firstLoginMethod (database)
 */
interface AuthInfo {
  biUserId: string | undefined;
  firstLoginMethod: string | undefined;
}

/**
 * Responsible for persisting user authentication metadata to the database.
 *
 * This service is called on every successful authentication (via /callback).
 * It handles:
 * - One-time initialization of firstLoginMethod and biUserId (write-once fields)
 * - Tracking the most recent login method in lastLoginMethod (updated every time)
 */
export class UserAuthInfoPersistenceService {
  private readonly logger = createServiceLogger(UserAuthInfoPersistenceService.name);

  constructor(
    private readonly store: DatabaseStore,
    private readonly tokenFacade: OwoxTokenFacade
  ) {}

  /**
   * Persists authentication metadata from access token to the database.
   *
   * Called after every successful OAuth callback. Fields behavior:
   * - firstLoginMethod: set only if not already present (tracks original auth method)
   * - biUserId: set only if not already present (tracks original external user ID)
   * - lastLoginMethod: updated on every call (tracks most recent auth method)
   *
   * @param accessToken - The access token to extract information from
   */
  async persistAuthInfo(accessToken: string): Promise<void> {
    try {
      const payload = await this.tokenFacade.parseToken(accessToken);
      if (!payload?.email) {
        this.logger.warn('Cannot persist auth info: email missing from token payload');
        return;
      }

      const authInfo = this.extractAuthInfo(payload);
      if (!authInfo.biUserId && !authInfo.firstLoginMethod) {
        this.logger.debug('No auth info to persist in token payload');
        return;
      }

      const user = await this.store.getUserByEmail(payload.email);
      if (!user) {
        this.logger.warn('Cannot persist auth info: user not found in DB', {
          email: payload.email,
        });
        return;
      }

      await this.updateUserFirstLoginInfo(user, authInfo);
      await this.updateUserLastLoginInfo(user, authInfo);
    } catch (error) {
      this.logger.warn(
        'Failed to persist auth info',
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Extracts authentication information from token payload.
   * Maps token field names to database field names:
   * - userId (token) -> biUserId (database)
   * - signinProvider (token) -> firstLoginMethod (database)
   */
  private extractAuthInfo(payload: Payload): AuthInfo {
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
   * Only updates fields that are not already set (write-once behavior).
   */
  private async updateUserFirstLoginInfo(user: DatabaseUser, loginInfo: AuthInfo): Promise<void> {
    if (loginInfo.firstLoginMethod && !user.firstLoginMethod) {
      await this.store.updateUserFirstLoginMethod(user.id, loginInfo.firstLoginMethod);
      this.logger.debug('Persisted firstLoginMethod for user', {
        userId: user.id,
        firstLoginMethod: loginInfo.firstLoginMethod,
      });
    }

    if (loginInfo.biUserId && !user.biUserId) {
      await this.store.updateUserBiUserId(user.id, loginInfo.biUserId);
      this.logger.debug('Persisted biUserId for user', {
        userId: user.id,
        biUserId: loginInfo.biUserId,
      });
    }
  }

  /**
   * Updates user's last login method in the database.
   * Updates every time (unlike firstLoginMethod which only sets once).
   */
  private async updateUserLastLoginInfo(user: DatabaseUser, loginInfo: AuthInfo): Promise<void> {
    if (!loginInfo.firstLoginMethod) {
      return;
    }

    try {
      await this.store.updateUserLastLoginMethod(user.id, loginInfo.firstLoginMethod);
      this.logger.debug('Persisted lastLoginMethod for user', {
        userId: user.id,
        lastLoginMethod: loginInfo.firstLoginMethod,
      });
    } catch (error) {
      this.logger.warn(
        'Failed to persist lastLoginMethod',
        { userId: user.id, lastLoginMethod: loginInfo.firstLoginMethod },
        error instanceof Error ? error : undefined
      );
    }
  }
}
