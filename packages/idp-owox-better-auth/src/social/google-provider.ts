import { createServiceLogger } from '../core/logger.js';
import { maskEmail } from '../utils/email-utils.js';
import { Profile, SocialProvider, SocialUser } from './social-provider.js';

export type GoogleProviderOptions = {
  clientId?: string;
  clientSecret?: string;
  redirectURI?: string;
  prompt?: string;
  accessType?: string;
};

/**
 * Maps Google OAuth profile data into the app user format.
 */
export class GoogleProvider implements SocialProvider {
  public providerId = 'google';
  private readonly logger = createServiceLogger(GoogleProvider.name);

  constructor(private readonly opts: GoogleProviderOptions) {
    this.validate();
  }

  private validate() {
    const missing = ['clientId', 'clientSecret'].filter(
      key => !(this.opts as Record<string, string | undefined>)[key]
    );
    if (missing.length) {
      throw new Error(`[google] Missing required secrets: ${missing.join(', ')}`);
    }
  }

  private selectAccountId(profile: Profile): string {
    const p = profile as { sub?: string };
    return p.sub ? String(p.sub) : '';
  }

  buildConfig() {
    return {
      clientId: this.opts.clientId,
      clientSecret: this.opts.clientSecret,
      redirectURI: this.opts.redirectURI,
      prompt: this.opts.prompt ?? 'select_account',
      accessType: this.opts.accessType ?? 'offline',
      mapProfileToUser: (profile: Record<string, unknown>) => {
        const mapped = this.mapProfile(profile);
        const { accountId, ...user } = mapped;
        return { ...user, id: accountId };
      },
    };
  }

  mapProfile(profile: Profile): SocialUser {
    const p = profile as {
      sub?: string;
      email?: string;
      name?: string;
      given_name?: string;
      picture?: string;
      email_verified?: boolean;
    };
    const profileForLog: Record<string, unknown> = { ...profile };
    if (typeof p.email === 'string') {
      profileForLog.email = maskEmail(p.email);
    }
    this.logger.info(`${this.providerId}-profile`, { profile: profileForLog });

    const accountId = this.selectAccountId(p);
    if (!accountId) {
      throw new Error('[google] Unable to resolve accountId (sub is missing)');
    }

    const email = p.email ?? null;
    if (!email) {
      throw new Error('[google] Email is required in profile');
    }

    return {
      accountId,
      email,
      name: p.name ?? p.given_name ?? null,
      image: p.picture ?? null,
      emailVerified: Boolean(p.email_verified),
    };
  }
}
