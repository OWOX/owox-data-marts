import { createServiceLogger } from '../../core/logger.js';
import type { DatabaseStore } from '../../store/database-store.js';
import type { VerifiedMicrosoftIdentity } from './microsoft-entra-access-token-verifier.js';

export type ExtensionIdentityResolution =
  | { status: 'resolved'; userId: string }
  | { status: 'unknown_identity' };

/** Resolves a verified external identity to an existing Analytics user. */
export class ExtensionIdentityResolver {
  private readonly logger = createServiceLogger(ExtensionIdentityResolver.name);

  constructor(private readonly store: DatabaseStore) {}

  async resolveMicrosoft(
    identity: VerifiedMicrosoftIdentity
  ): Promise<ExtensionIdentityResolution> {
    const linkedAccount = await this.store.getAccountByProviderAndAccountId(
      'microsoft',
      identity.accountId
    );
    if (linkedAccount) {
      return this.resolveLinkedUser(linkedAccount.userId, 'account_link');
    }

    if (!identity.verifiedEmail) {
      this.logger.info('Microsoft extension identity has no safe account match', {
        resolution: 'missing_verified_email',
      });
      return { status: 'unknown_identity' };
    }

    const emailUser = await this.store.getUserByEmail(identity.verifiedEmail);
    if (!emailUser?.biUserId) {
      this.logger.info('Microsoft extension identity has no existing user match', {
        resolution: 'email_not_found',
      });
      return { status: 'unknown_identity' };
    }

    const durableAccount = await this.store.linkAccount(
      'microsoft',
      identity.accountId,
      emailUser.id
    );
    return this.resolveLinkedUser(durableAccount.userId, 'verified_email_link');
  }

  private async resolveLinkedUser(
    localUserId: string,
    resolution: string
  ): Promise<ExtensionIdentityResolution> {
    const user = await this.store.getUserById(localUserId);
    if (!user?.biUserId) {
      this.logger.info('Microsoft extension account is not linked to an Analytics identity', {
        resolution: 'missing_bi_user_id',
      });
      return { status: 'unknown_identity' };
    }

    this.logger.info('Microsoft extension identity resolved', { resolution });
    return { status: 'resolved', userId: user.biUserId };
  }
}
