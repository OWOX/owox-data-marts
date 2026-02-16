import { betterAuth } from 'better-auth';
import type { DatabaseStore } from '../../store/database-store.js';
import { parseEmail } from '../../utils/email-utils.js';
import { MagicLinkEmailService, type MagicLinkIntent } from '../email/magic-link-email-service.js';

type BetterAuthInstance = Awaited<ReturnType<typeof betterAuth>>;

export type MagicLinkSendResult =
  | { sent: true }
  | {
      sent: false;
      reason: 'user_not_found' | 'not_initialized' | 'invalid_email';
    }
  | {
      sent: false;
      reason: 'rate_limited';
      waitSeconds: number;
    };

/**
 * Handles magic-link generation and sending, with guards for reset of unknown users.
 * Keeps sendMagicLink callback separate from creation to avoid tight coupling in config.
 */
export class MagicLinkService {
  private static readonly RESEND_COOLDOWN_SECONDS = 60;
  private auth?: BetterAuthInstance;

  constructor(
    private readonly store: DatabaseStore,
    private readonly emailService: MagicLinkEmailService,
    private readonly baseUrl: string,
    private readonly magicLinkTtlSeconds: number = 60 * 60
  ) {}

  setAuth(auth: BetterAuthInstance): void {
    this.auth = auth;
  }

  /**
   * sendMagicLink callback for Better Auth plugin.
   * Builds pre-confirm link and delegates to email service.
   */
  buildSender(): (params: { email: string; token: string; url: string }) => Promise<void> {
    return async ({ email, token, url }) => {
      const normalizedEmail = parseEmail(email);
      if (!normalizedEmail) {
        throw new Error('Invalid email for magic-link sender');
      }
      const { link, intent } = this.buildPreConfirmLink(url, token);
      await this.emailService.send({ email: normalizedEmail, magicLink: link, intent });
    };
  }

  /**
   * sendResetPassword callback for Better Auth emailAndPassword config.
   * Builds reset-password setup URL and delegates to email service.
   */
  buildResetPasswordSender(): (params: {
    email: string;
    token: string;
    url: string;
  }) => Promise<void> {
    return async ({ email, token }) => {
      const normalizedEmail = parseEmail(email);
      if (!normalizedEmail) {
        throw new Error('Invalid email for reset-password sender');
      }

      const resetUrl = new URL('/auth/password/setup', this.baseUrl);
      resetUrl.searchParams.set('intent', 'reset');
      resetUrl.searchParams.set('token', token);

      await this.emailService.send({
        email: normalizedEmail,
        magicLink: resetUrl.toString(),
        intent: 'reset',
      });
    };
  }

  /**
   * Generates magic link for signup/reset.
   * For reset, silently skips sending if user does not exist.
   */
  async generate(email: string, intent: MagicLinkIntent): Promise<MagicLinkSendResult> {
    if (!this.auth) {
      return { sent: false, reason: 'not_initialized' };
    }

    const normalizedEmail = parseEmail(email);
    if (!normalizedEmail) {
      return { sent: false, reason: 'invalid_email' };
    }

    if (intent === 'reset') {
      const user = await this.store.getUserByEmail(normalizedEmail);
      if (!user) {
        return { sent: false, reason: 'user_not_found' };
      }
      const accounts = await this.store.getAccountsByUserId(user.id);
      const hasCredentialAccount = accounts.some(account => account.providerId === 'credential');
      if (!hasCredentialAccount) {
        return { sent: false, reason: 'user_not_found' };
      }

      const redirectTo = new URL('/auth/password/setup', this.baseUrl);
      redirectTo.searchParams.set('intent', 'reset');
      await this.auth.api.requestPasswordReset({
        body: {
          email: normalizedEmail,
          redirectTo: redirectTo.toString(),
        },
      });
      return { sent: true };
    }

    const now = Date.now();
    const activeVerification = await this.store.findActiveMagicLink(normalizedEmail);
    if (activeVerification?.createdAt) {
      const createdAtMs = activeVerification.createdAt.getTime();
      const elapsedMs = now - createdAtMs;
      const cooldownMs = MagicLinkService.RESEND_COOLDOWN_SECONDS * 1000;

      if (elapsedMs < cooldownMs) {
        const waitSeconds = Math.ceil((cooldownMs - elapsedMs) / 1000);
        return { sent: false, reason: 'rate_limited', waitSeconds };
      }
    }

    const callbackURL = this.buildCallbackUrl(intent);
    const request = new Request(
      `${this.baseUrl.replace(/\/$/, '')}/auth/better-auth/sign-in/magic-link`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, callbackURL }),
      }
    );

    const response = await this.auth.handler(request);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Magic link generation failed: ${response.status} ${text}`);
    }

    return { sent: true };
  }

  private buildCallbackUrl(intent: MagicLinkIntent): string {
    const url = new URL('/auth/password/setup', this.baseUrl);
    if (intent) {
      url.searchParams.set('intent', intent);
    }
    return url.toString();
  }

  private buildPreConfirmLink(
    url: string,
    token: string
  ): { link: string; intent?: MagicLinkIntent } {
    try {
      const original = new URL(url);
      const tokenParam = original.searchParams.get('token') || token;
      const callbackParam = original.searchParams.get('callbackURL') || '';
      const intent = this.extractIntent(callbackParam, original.searchParams.get('intent'));

      const preConfirmPage = new URL(original.origin);
      preConfirmPage.pathname = '/auth/magic-link';
      preConfirmPage.searchParams.set('token', tokenParam);
      if (callbackParam) {
        preConfirmPage.searchParams.set('callbackURL', callbackParam);
      }
      if (intent) {
        preConfirmPage.searchParams.set('intent', intent);
      }

      return { link: preConfirmPage.toString(), intent };
    } catch {
      return { link: url, intent: undefined };
    }
  }

  private extractIntent(callbackParam: string, intentFromUrl: string | null): MagicLinkIntent {
    if (intentFromUrl === 'signup' || intentFromUrl === 'reset') {
      return intentFromUrl;
    }

    try {
      const callbackUrl = new URL(callbackParam, 'http://localhost');
      const intentFromCallback = callbackUrl.searchParams.get('intent');
      if (intentFromCallback === 'signup' || intentFromCallback === 'reset') {
        return intentFromCallback;
      }
    } catch {
      // ignore malformed callback url
    }

    return undefined;
  }
}
