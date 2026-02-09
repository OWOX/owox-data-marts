import { type Request } from 'express';
import { createBetterAuthConfig } from '../config/idp-better-auth-config.js';
import { BETTER_AUTH_SESSION_COOKIE } from '../constants.js';
import { logger } from '../logger.js';
import { buildUserInfoPayload } from '../mappers/user-info-payload-builder.js';
import type { DatabaseStore } from '../store/database-store.js';
import { AuthSession } from '../types/auth-session.js';
import { getStateManager } from '../utils/request-utils.js';
import { AuthFlowService, type UserInfoPayload } from './auth-flow-service.js';

/**
 * Better Auth integration for social login and user/account lookup.
 * Core IdP tokens are handled in OwoxTokenFacade/FlowCompletionService.
 */
/**
 * Reads Better Auth session data and builds payloads
 * for the Platform auth flow.
 */
export class AuthenticationService {
  constructor(
    private readonly auth: Awaited<ReturnType<typeof createBetterAuthConfig>>,
    private readonly store: DatabaseStore,
    private readonly authFlowService: AuthFlowService
  ) {}

  async buildUserInfoPayload(req: Request): Promise<UserInfoPayload> {
    const stateManager = getStateManager(req);
    const session = await this.getSession(req);
    if (session?.user) {
      const [dbUser, account] = await Promise.all([
        this.store.getUserById(session.user.id),
        this.store.getAccountByUserId(session.user.id),
      ]);

      if (!account) {
        throw new Error(`No account found for user ${session.user.id}`);
      }

      if (!dbUser) {
        throw new Error(`User not found in DB for session ${session.user.id}`);
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
    logger.info('Sending auth flow payload', {
      hasState: Boolean(payload.state),
      signinProvider: payload.userInfo.signinProvider,
      userId: payload.userInfo.uid,
    });
    const result = await this.authFlowService.completeAuthFlow(payload);
    logger.info('Integrated backend responded', { hasCode: Boolean(result.code) });
    return { code: result.code, payload };
  }

  async completeAuthFlowWithSessionToken(
    sessionToken: string,
    state: string
  ): Promise<{ code: string; payload: UserInfoPayload }> {
    const headers = new Headers();
    headers.set('cookie', `${BETTER_AUTH_SESSION_COOKIE}=${encodeURIComponent(sessionToken)}`);

    const session = await this.auth.api.getSession({ headers });
    if (!session || !session.user || !session.session) {
      throw new Error('Failed to resolve session from Better Auth token');
    }

    const dbUser = await this.store.getUserById(session.user.id);
    const account = await this.store.getAccountByUserId(session.user.id);
    if (!account) {
      throw new Error(`No account found for user ${session.user.id}`);
    }

    if (!dbUser) {
      throw new Error(`User not found in DB for session ${session.user.id}`);
    }

    const payload: UserInfoPayload = buildUserInfoPayload({
      state,
      user: dbUser,
      account,
    });

    logger.info('Sending auth flow payload (callback)', {
      state: payload.state,
      userInfo: payload.userInfo,
    });
    const result = await this.authFlowService.completeAuthFlow(payload);
    logger.info('Integrated backend responded (callback)', { hasCode: Boolean(result.code) });
    return { code: result.code, payload };
  }

  async getSession(req: Request): Promise<AuthSession | null> {
    try {
      const session = await this.auth.api.getSession({
        headers: req.headers as unknown as Headers,
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
      logger.error('Failed to get session', {}, error as Error);
      throw new Error('Failed to get session');
    }
  }
}
