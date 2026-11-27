import type { IdentityOwoxClient } from '../../client/index.js';
import { AuthenticationException } from '../../core/exceptions.js';
import { createServiceLogger } from '../../core/logger.js';
import {
  APP_SIGN_IN_STATE_TTL_MS,
  deriveCodeChallenge,
  generateAppSignInState,
  generatePkce,
  isAppSignInState,
} from '../../core/pkce.js';
import type { OwoxTokenFacade, TokenResponseWithContext } from '../../facades/owox-token-facade.js';
import type { DatabaseStore } from '../../store/database-store.js';
import type { AuthFlowParams } from '../../utils/request-utils.js';
import type { BetterAuthSessionService } from './better-auth-session-service.js';

/** Completes sign-in on the App backend using its existing PKCE state and IB token exchange. */
export class AppSignInService {
  private readonly logger = createServiceLogger(AppSignInService.name);
  private nextStatePurgeAt = 0;

  constructor(
    private readonly store: DatabaseStore,
    private readonly sessions: BetterAuthSessionService,
    private readonly identityClient: IdentityOwoxClient,
    private readonly tokens: OwoxTokenFacade
  ) {}

  async start(params: AuthFlowParams): Promise<string> {
    const { codeVerifier } = await generatePkce();
    const state = generateAppSignInState();
    const now = Date.now();
    const expiresAt = new Date(now + APP_SIGN_IN_STATE_TTL_MS);
    await this.store.saveAuthState(state, codeVerifier, expiresAt, params);
    if (now >= this.nextStatePurgeAt) {
      this.nextStatePurgeAt = now + APP_SIGN_IN_STATE_TTL_MS;
      void this.store.purgeExpiredAuthStates().catch(() => {
        this.logger.warn('Could not purge expired sign-in state');
      });
    }
    return state;
  }

  async complete(
    state: string,
    sessionToken: string,
    provider: string
  ): Promise<TokenResponseWithContext> {
    if (!isAppSignInState(state)) {
      throw new AuthenticationException('App sign-in state is missing');
    }
    const identity = await this.sessions.resolveVerifiedIdentity(sessionToken, state, provider);
    const { code: verifier, authFlowParams } = await this.store.getAuthState(state);
    if (!verifier) {
      throw new AuthenticationException('App sign-in state expired or was already used');
    }

    const { code } = await this.identityClient.authorizeAppSignIn({
      ...identity,
      codeChallenge: deriveCodeChallenge(verifier),
      projectId: authFlowParams?.projectId,
      projectRedirectUserId: authFlowParams?.projectRedirectUserId,
      integration: authFlowParams?.integration,
    });
    const tokens = await this.tokens.exchangeAuthCode(code, verifier);
    return { ...tokens, authFlowParams: authFlowParams ?? {} };
  }
}
