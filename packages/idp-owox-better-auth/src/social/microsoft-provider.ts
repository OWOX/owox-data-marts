import { LogLevel } from '@owox/internal-helpers';
import { Profile, ProviderLogger, SocialProvider, SocialUser } from './social-provider.js';

export type MicrosoftProviderOptions = {
  clientId?: string;
  clientSecret?: string;
  redirectURI?: string;
  prompt?: string;
  tenantId?: string;
  authority?: string;
  logger?: ProviderLogger;
};

export class MicrosoftProvider implements SocialProvider {
  public providerId = 'microsoft';

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
    const p = profile as { oid?: string; tid?: string; id?: string; uid?: string; sub?: string };
    if (p.oid && p.tid) return `oid:${p.oid}:tid:${p.tid}`;
    if (p.oid) return `oid:${p.oid}`;
    if (p.uid) return String(p.uid);
    if (p.id) return String(p.id);
    if (p.sub) return String(p.sub);
    return '';
  }

  buildConfig() {
    return {
      clientId: this.opts.clientId,
      clientSecret: this.opts.clientSecret,
      redirectURI: this.opts.redirectURI,
      prompt: this.opts.prompt ?? 'select_account',
      ...(this.opts.tenantId ? { tenantId: this.opts.tenantId } : {}),
      ...(this.opts.authority ? { authority: this.opts.authority } : {}),
      mapProfileToUser: (profile: Record<string, unknown>) => {
        const mapped = this.mapProfile(profile);
        const { accountId, ...user } = mapped;
        return { ...user, id: accountId };
      },
    };
  }

  mapProfile(profile: Profile): SocialUser {
    this.opts.logger?.log(LogLevel.INFO, `${this.providerId}-profile`, { profile });

    const p = profile as {
      id?: string;
      uid?: string;
      sub?: string;
      email?: string;
      preferred_username?: string;
      name?: string;
      photo?: string;
      picture?: string;
      oid?: string;
      tid?: string;
    };

    const accountId = this.selectAccountId(p);
    if (!accountId) {
      throw new Error('[microsoft] Unable to resolve accountId (oid/tid/sub missing)');
    }

    const email = p.email ?? p.preferred_username ?? null;
    if (!email) {
      throw new Error('[microsoft] Email is required in profile');
    }

    return {
      accountId,
      email,
      name: p.name ?? null,
      image: p.photo ?? p.picture ?? null,
      emailVerified: true,
    };
  }
}
