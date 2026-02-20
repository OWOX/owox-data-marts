import { betterAuth } from 'better-auth';
import { MAGIC_LINK_INTENT, parseMagicLinkIntent } from '../../core/constants.js';
import { createServiceLogger } from '../../core/logger.js';
import type { DatabaseStore } from '../../store/database-store.js';
import type { MagicLinkIntent } from '../../types/magic-link.js';
import { maskEmail } from '../../utils/email-utils.js';
import {
  EmailValidationService,
  type EmailValidationResult,
} from '../email/email-validation-service.js';
import { MagicLinkEmailService } from '../email/magic-link-email-service.js';

type BetterAuthInstance = Awaited<ReturnType<typeof betterAuth>>;

export type MagicLinkSendResult =
  | { sent: true }
  | {
      sent: false;
      reason: 'user_not_found' | 'not_initialized' | 'invalid_email';
    }
  | {
      sent: false;
      reason: 'blocked_email_policy';
      blockReason: Extract<EmailValidationResult, { status: 'blocked' }>['reason'];
    }
  | {
      sent: false;
      reason: 'rate_limited';
      waitSeconds: number;
    };

type MagicLinkFailureReason = Extract<MagicLinkSendResult, { sent: false }>['reason'];
/**
 * Handles magic-link generation and sending, with guards for reset of unknown users.
 * Keeps sendMagicLink callback separate from creation to avoid tight coupling in config.
 */
export class MagicLinkService {
  private static readonly RESEND_COOLDOWN_SECONDS = 60;
  private readonly logger = createServiceLogger(MagicLinkService.name);
  private auth?: BetterAuthInstance;

  constructor(
    private readonly store: DatabaseStore,
    private readonly emailService: MagicLinkEmailService,
    private readonly baseUrl: string,
    private readonly emailValidationService: EmailValidationService = new EmailValidationService()
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
      const { link, intent } = this.buildPreConfirmLink(url, token);
      const validation = this.emailValidationService.validateMagicLinkEmail(email);
      if (validation.status !== 'allowed') {
        throw new Error('Invalid email for magic-link sender');
      }
      await this.emailService.send({ email: validation.email, magicLink: link, intent });
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
      const validation = this.emailValidationService.validateMagicLinkEmail(email);
      if (validation.status !== 'allowed') {
        throw new Error('Invalid email for reset-password sender');
      }

      const resetUrl = new URL('/auth/password/setup', this.baseUrl);
      resetUrl.searchParams.set('intent', MAGIC_LINK_INTENT.RESET);
      resetUrl.searchParams.set('token', token);

      await this.emailService.send({
        email: validation.email,
        magicLink: resetUrl.toString(),
        intent: MAGIC_LINK_INTENT.RESET,
      });
    };
  }

  /**
   * Requests magic link for signup/reset.
   * For reset, silently skips sending if user does not exist.
   */
  async requestMagicLink(email: unknown, intent: MagicLinkIntent): Promise<MagicLinkSendResult> {
    if (!this.auth) {
      this.logMagicLinkAttempt({
        type: 'failed',
        reason: 'not_initialized',
        intent,
      });
      return { sent: false, reason: 'not_initialized' };
    }

    const validation = this.emailValidationService.validateMagicLinkEmail(email);
    if (validation.status === 'invalid') {
      this.logMagicLinkAttempt({
        type: 'failed',
        reason: 'invalid_email',
        intent,
      });
      return { sent: false, reason: 'invalid_email' };
    }
    if (validation.status === 'blocked') {
      this.logMagicLinkAttempt({
        type: 'blocked',
        validation,
        intent,
      });
      return {
        sent: false,
        reason: 'blocked_email_policy',
        blockReason: validation.reason,
      };
    }
    const normalizedEmail = validation.email;

    if (intent === MAGIC_LINK_INTENT.RESET) {
      const user = await this.store.getUserByEmail(normalizedEmail);
      if (!user) {
        this.logMagicLinkAttempt({
          type: 'failed',
          reason: 'user_not_found',
          intent,
          details: { email: normalizedEmail },
        });
        return { sent: false, reason: 'user_not_found' };
      }
      const accounts = await this.store.getAccountsByUserId(user.id);
      const hasCredentialAccount = accounts.some(account => account.providerId === 'credential');
      if (!hasCredentialAccount) {
        this.logMagicLinkAttempt({
          type: 'failed',
          reason: 'user_not_found',
          intent,
          details: { email: normalizedEmail },
        });
        return { sent: false, reason: 'user_not_found' };
      }

      const redirectTo = new URL('/auth/password/setup', this.baseUrl);
      redirectTo.searchParams.set('intent', MAGIC_LINK_INTENT.RESET);
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
        this.logMagicLinkAttempt({
          type: 'failed',
          reason: 'rate_limited',
          intent,
          details: { email: normalizedEmail, waitSeconds },
        });
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
    const parsedIntentFromUrl = parseMagicLinkIntent(intentFromUrl);
    if (parsedIntentFromUrl) {
      return parsedIntentFromUrl;
    }

    try {
      const callbackUrl = new URL(callbackParam, 'http://localhost');
      const parsedIntentFromCallback = parseMagicLinkIntent(callbackUrl.searchParams.get('intent'));
      if (parsedIntentFromCallback) {
        return parsedIntentFromCallback;
      }
    } catch {
      // ignore malformed callback url
    }

    return undefined;
  }

  private logMagicLinkAttempt(
    context:
      | {
          type: 'blocked';
          validation: Extract<EmailValidationResult, { status: 'blocked' }>;
          intent: MagicLinkIntent | undefined;
        }
      | {
          type: 'failed';
          reason: MagicLinkFailureReason;
          intent: MagicLinkIntent | undefined;
          details?: {
            email?: string;
            waitSeconds?: number;
          };
        }
  ): void {
    if (context.type === 'blocked') {
      const { validation, intent } = context;
      this.logger.warn('Magic link email blocked by policy', {
        email: maskEmail(validation.email),
        domain: validation.domain,
        reason: validation.reason,
        intent,
      });
      return;
    }

    const { reason, intent, details = {} } = context;
    const sanitizedDetails = details.email
      ? { ...details, email: maskEmail(details.email) }
      : details;
    this.logger.warn('Magic link attempt failed', {
      reason,
      intent,
      ...sanitizedDetails,
    });
  }
}
