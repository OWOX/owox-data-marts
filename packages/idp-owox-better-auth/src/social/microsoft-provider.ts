import { createServiceLogger } from '../core/logger.js';
import { maskEmail } from '../utils/email-utils.js';
import { Profile, SocialProvider, SocialUser } from './social-provider.js';

export type MicrosoftProviderOptions = {
  clientId?: string;
  clientSecret?: string;
  redirectURI?: string;
  tenantId?: string;
  authority?: string;
  prompt?: string;
};

/**
 * Maps Microsoft Entra ID profile data into the app user format.
 */
export class MicrosoftProvider implements SocialProvider {
  public providerId = 'microsoft';
  private readonly logger = createServiceLogger(MicrosoftProvider.name);

  constructor(private readonly opts: MicrosoftProviderOptions) {
    this.validate();
  }

  private validate() {
    const missing = ['clientId', 'clientSecret'].filter(
      key => !(this.opts as Record<string, string | undefined>)[key]
    );
    if (missing.length) {
      throw new Error(`[microsoft] Missing required secrets: ${missing.join(', ')}`);
    }
  }

  private selectAccountId(profile: Profile): string {
    const p = profile as { oid?: string; tid?: string };
    if (p.oid && p.tid) return `${p.oid}:${p.tid}`;
    return '';
  }

  buildConfig() {
    return {
      clientId: this.opts.clientId,
      clientSecret: this.opts.clientSecret,
      redirectURI: this.opts.redirectURI,
      tenantId: this.opts.tenantId ?? 'common',
      authority: this.opts.authority ?? 'https://login.microsoftonline.com',
      prompt: this.opts.prompt ?? 'select_account',
      mapProfileToUser: (profile: Record<string, unknown>) => {
        const mapped = this.mapProfile(profile);
        const { accountId, ...user } = mapped;
        return { ...user, id: accountId };
      },
    };
  }

  mapProfile(profile: Profile): SocialUser {
    const p = profile as {
      oid?: string;
      tid?: string;
      email?: string;
      preferred_username?: string;
      name?: string;
    };
    const profileForLog: Record<string, unknown> = { ...profile };
    if (typeof p.email === 'string') {
      profileForLog.email = maskEmail(p.email);
    }
    if (typeof p.preferred_username === 'string') {
      profileForLog.preferred_username = maskEmail(p.preferred_username);
    }
    this.logger.info(`${this.providerId}-profile`, { profile: profileForLog });

    const accountId = this.selectAccountId(p);
    if (!accountId) {
      throw new Error('[microsoft] Unable to resolve accountId (oid/tid are missing)');
    }

    const email = p.email ?? p.preferred_username ?? null;
    if (!email) {
      throw new Error('[microsoft] Email is required in profile');
    }

    return {
      accountId,
      email,
      name: p.name ?? null,
      image: null,
      emailVerified: true,
    };
  }
}
