import type { AuthResult } from '@owox/idp-protocol';
import type { OwoxTokenFacade } from '../../facades/owox-token-facade.js';
import { MicrosoftEntraAccessTokenVerifier } from './microsoft-entra-access-token-verifier.js';

export type ExtensionAssertionExchangeResult =
  | { status: 'authenticated'; auth: AuthResult }
  | { status: 'unknown_identity' };

/** Verifies Microsoft assertions and delegates ROI provisioning plus project-token issuing to IB. */
export class ExtensionAuthService {
  constructor(
    private readonly microsoftVerifier: MicrosoftEntraAccessTokenVerifier,
    private readonly tokenFacade: OwoxTokenFacade
  ) {}

  async exchangeMicrosoftAssertion(
    assertion: string,
    projectId?: string
  ): Promise<ExtensionAssertionExchangeResult> {
    const identity = await this.microsoftVerifier.verify(assertion);
    if (!identity.verifiedEmail) return { status: 'unknown_identity' };

    const auth = await this.tokenFacade.exchangeMicrosoftExtensionIdentity({
      oid: identity.oid,
      tid: identity.tid,
      email: identity.verifiedEmail,
      ...(identity.firstName ? { firstName: identity.firstName } : {}),
      ...(identity.lastName ? { lastName: identity.lastName } : {}),
      ...(identity.fullName ? { fullName: identity.fullName } : {}),
      ...(projectId ? { biProjectId: projectId } : {}),
    });
    return { status: 'authenticated', auth };
  }

  async refreshProjectToken(refreshToken: string): Promise<AuthResult> {
    return this.tokenFacade.refreshExtensionProjectToken(refreshToken);
  }

  async revokeProjectToken(refreshToken: string): Promise<void> {
    await this.tokenFacade.revokeExtensionProjectToken(refreshToken);
  }
}
