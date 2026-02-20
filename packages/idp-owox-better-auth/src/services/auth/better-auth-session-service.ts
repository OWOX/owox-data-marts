import { type Request } from 'express';
import { createBetterAuthConfig } from '../../config/idp-better-auth-config.js';
import { BETTER_AUTH_SESSION_COOKIE } from '../../core/constants.js';
import { createServiceLogger } from '../../core/logger.js';
import { buildUserInfoPayload } from '../../mappers/user-info-payload-builder.js';
import type { DatabaseStore } from '../../store/database-store.js';
import { AuthSession } from '../../types/auth-session.js';
import {
  resolveAccountForUser,
  resolveProviderFromLoginMethod,
} from '../../utils/account-resolver.js';
import { convertExpressHeaders } from '../../utils/express-compat.js';
import { getStateManager } from '../../utils/request-utils.js';
import { PlatformAuthFlowClient, type UserInfoPayload } from './platform-auth-flow-client.js';

/**
 * Better Auth integration for social login and user/account lookup.
 * Manages Better Auth sessions and user data.
 * Core IdP tokens are handled in OwoxTokenFacade/PkceFlowOrchestrator.
 */
export class BetterAuthSessionService {
  private readonly logger = createServiceLogger(BetterAuthSessionService.name);

  constructor(
    private readonly auth: Awaited<ReturnType<typeof createBetterAuthConfig>>,
    private readonly store: DatabaseStore,
    private readonly platformAuthFlowClient: PlatformAuthFlowClient
  ) {}

  async buildUserInfoPayload(req: Request): Promise<UserInfoPayload> {
    const stateManager = getStateManager(req);
    const session = await this.getSession(req);
    if (session?.user) {
      const dbUser = await this.store.getUserById(session.user.id);
      if (!dbUser) {
        throw new Error(`User not found in DB for session ${session.user.id}`);
      }

      const account = await resolveAccountForUser(
        this.store,
        session.user.id,
        dbUser.lastLoginMethod
      );
      if (!account) {
        throw new Error(`No account found for user ${session.user.id}`);
      }

      return buildUserInfoPayload({
        state: stateManager.extract(),
        user: dbUser,
        account,
      });
    }
    throw new Error('No session found for user info');
  }

  async completeAuthFlow(req: Request): Promise<{ code: string; payload: UserInfoPayload }> {
    const payload = await this.buildUserInfoPayload(req);
    this.logger.info('Sending auth flow payload', {
      hasState: Boolean(payload.state),
      signinProvider: payload.userInfo.signinProvider,
      userId: payload.userInfo.uid,
    });
    const result = await this.platformAuthFlowClient.completeAuthFlow(payload);
    const session = await this.getSession(req);
    if (session?.user?.id) {
      await this.tryPersistLastLoginMethod(session.user.id, payload.userInfo.signinProvider);
    }
    this.logger.info('OWOX client completed auth flow', { hasCode: Boolean(result.code) });
    return { code: result.code, payload };
  }

  async completeAuthFlowWithSessionToken(
    sessionToken: string,
    state: string,
    callbackProviderId?: string
  ): Promise<{ code: string; payload: UserInfoPayload }> {
    const encodedToken = encodeURIComponent(sessionToken);
    let session: Awaited<ReturnType<typeof this.auth.api.getSession>> | null = null;

    for (const cookieName of this.resolveSessionCookieNames()) {
      const headers = new Headers();
      headers.set('cookie', `${cookieName}=${encodedToken}`);
      const candidate = await this.auth.api.getSession({ headers });
      if (candidate?.user && candidate?.session) {
        session = candidate;
        break;
      }
    }

    if (!session || !session.user || !session.session) {
      throw new Error('Failed to resolve session from Better Auth token');
    }

    const dbUser = await this.store.getUserById(session.user.id);
    if (!dbUser) {
      throw new Error(`User not found in DB for session ${session.user.id}`);
    }

    const loginMethod = callbackProviderId || dbUser.lastLoginMethod;
    const account = await resolveAccountForUser(this.store, session.user.id, loginMethod);
    if (!account) {
      throw new Error(`No account found for user ${session.user.id}`);
    }

    const payload: UserInfoPayload = buildUserInfoPayload({
      state,
      user: dbUser,
      account,
    });

    this.logger.info('OWOX client sending auth flow payload with session token', {
      state: payload.state,
      userId: dbUser.id,
      provider: account.providerId,
    });
    const result = await this.platformAuthFlowClient.completeAuthFlow(payload);
    await this.tryPersistLastLoginMethod(dbUser.id, account.providerId);
    this.logger.info('OWOX client completed auth flow with session token', {
      hasCode: Boolean(result.code),
    });
    return { code: result.code, payload };
  }

  private resolveSessionCookieNames(): string[] {
    const secure = this.auth.options.advanced?.cookies?.session_token?.attributes?.secure === true;
    const primaryName = secure
      ? `__Secure-${BETTER_AUTH_SESSION_COOKIE}`
      : BETTER_AUTH_SESSION_COOKIE;
    return Array.from(
      new Set([
        primaryName,
        BETTER_AUTH_SESSION_COOKIE,
        `__Secure-${BETTER_AUTH_SESSION_COOKIE}`,
        `__Host-${BETTER_AUTH_SESSION_COOKIE}`,
      ])
    );
  }

  async getSession(req: Request): Promise<AuthSession | null> {
    try {
      const session = await this.auth.api.getSession({
        headers: convertExpressHeaders(req),
      });

      if (!session || !session.user || !session.session) {
        return null;
      }

      return {
        user: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
        },
        session: {
          id: session.session.id,
          userId: session.session.userId,
          token: session.session.token,
          expiresAt: session.session.expiresAt,
        },
      };
    } catch (error) {
      this.logger.error(
        'Failed to get Better Auth session',
        undefined,
        error instanceof Error ? error : undefined
      );
      throw new Error('Failed to get Better Auth session');
    }
  }

  private async tryPersistLastLoginMethod(userId: string, providerId: string): Promise<void> {
    const method = resolveProviderFromLoginMethod(providerId) ?? providerId?.trim().toLowerCase();
    if (!method) return;
    try {
      await this.store.updateUserLastLoginMethod(userId, method);
    } catch (error) {
      this.logger.warn(
        'Failed to persist lastLoginMethod after successful authorization',
        {
          userId,
          method,
        },
        error instanceof Error ? error : undefined
      );
    }
  }
}
