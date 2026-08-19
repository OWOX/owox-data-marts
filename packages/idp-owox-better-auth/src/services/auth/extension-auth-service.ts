import type { AuthResult, Projects } from '@owox/idp-protocol';
import { AuthenticationException } from '../../core/exceptions.js';
import type { OwoxTokenFacade } from '../../facades/owox-token-facade.js';
import type { DatabaseStore } from '../../store/database-store.js';
import { ExtensionIdentityResolver } from './extension-identity-resolver.js';
import { MicrosoftEntraAccessTokenVerifier } from './microsoft-entra-access-token-verifier.js';

export type ExtensionAssertionExchangeResult =
  | { status: 'authenticated'; auth: AuthResult }
  | { status: 'unknown_identity' };

/** Coordinates external assertion verification with IB-owned token issuing. */
export class ExtensionAuthService {
  constructor(
    private readonly microsoftVerifier: MicrosoftEntraAccessTokenVerifier,
    private readonly identityResolver: ExtensionIdentityResolver,
    private readonly store: DatabaseStore,
    private readonly tokenFacade: OwoxTokenFacade
  ) {}

  async exchangeMicrosoftAssertion(
    assertion: string,
    projectId?: string
  ): Promise<ExtensionAssertionExchangeResult> {
    const identity = await this.microsoftVerifier.verify(assertion);
    const consumed = await this.store.consumeExtensionAssertion(
      identity.replayKey,
      identity.expiresAt
    );
    if (!consumed) {
      throw new AuthenticationException('Microsoft assertion has already been used', {
        description: 'assertion_replayed',
        context: { reason: 'assertion_replayed' },
      });
    }
    const resolution = await this.identityResolver.resolveMicrosoft(identity);
    if (resolution.status === 'unknown_identity') return resolution;

    const issued = await this.tokenFacade.issueExtensionSession(resolution.userId, projectId);
    return { status: 'authenticated', auth: issued.auth };
  }

  async refreshIdentitySession(refreshToken: string): Promise<AuthResult> {
    return this.tokenFacade.refreshExtensionSession(refreshToken);
  }

  async listProjects(accessToken: string): Promise<Projects> {
    return this.tokenFacade.getExtensionSessionProjects(accessToken);
  }

  async exchangeProjectToken(accessToken: string, projectId: string): Promise<AuthResult> {
    return this.tokenFacade.exchangeExtensionSessionProjectToken(accessToken, projectId);
  }

  async refreshProjectToken(refreshToken: string): Promise<AuthResult> {
    return this.tokenFacade.refreshExtensionProjectToken(refreshToken);
  }

  async revoke(refreshToken: string): Promise<void> {
    try {
      await this.tokenFacade.revokeExtensionSession(refreshToken);
    } catch (error) {
      if (!(error instanceof AuthenticationException)) throw error;
      await this.tokenFacade.revokeExtensionProjectToken(refreshToken);
    }
  }
}
