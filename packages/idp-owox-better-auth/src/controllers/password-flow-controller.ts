import { ProtocolRoute } from '@owox/idp-protocol';
import {
    type Express,
    type Request as ExpressRequest,
    type Response as ExpressResponse,
} from 'express';
import type { createBetterAuthConfig } from '../config/idp-better-auth-config.js';
import { logger } from '../core/logger.js';
import type { BetterAuthSessionService } from '../services/auth/better-auth-session-service.js';
import { MagicLinkService } from '../services/auth/magic-link-service.js';
import type { MagicLinkIntent } from '../services/email/magic-link-email-service.js';
import { TemplateService } from '../services/rendering/template-service.js';
import { parseEmail } from '../utils/email-utils.js';
import { convertExpressHeaders } from '../utils/express-compat.js';
import { clearBetterAuthCookies } from '../utils/request-utils.js';

const AUTH_BASE_PATH = '/auth';
type BetterAuthInstance = Awaited<ReturnType<typeof createBetterAuthConfig>>;

/**
 * Handles password-related flows: magic link sending, password setup/reset,
 * and password success pages.
 */
export class PasswordFlowController {
  constructor(
    private readonly auth: BetterAuthInstance,
    private readonly sessionService: BetterAuthSessionService,
    private readonly magicLinkService: MagicLinkService
  ) {}

  async sendMagicLink(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    const email = parseEmail(req.body?.email);
    const intent: MagicLinkIntent = req.body?.intent === 'reset' ? 'reset' : 'signup';

    if (!email) {
      res.status(400).json({ error: 'A valid email is required.' });
      return;
    }

    try {
      const result = await this.magicLinkService.generate(email, intent);
      if (!result.sent && result.reason === 'user_not_found') {
        // Silently succeed for non-existing users on reset
        res.json({ status: 'ok' });
        return;
      }
      if (!result.sent && result.reason === 'invalid_email') {
        res.status(400).json({ error: 'A valid email is required.' });
        return;
      }
      if (!result.sent && result.reason === 'rate_limited') {
        res.status(429).json({
          error: 'Please wait before requesting another email',
          waitSeconds: result.waitSeconds,
        });
        return;
      }
      if (!result.sent) {
        throw new Error('Magic link service is not initialized');
      }
      res.json({ status: 'ok' });
    } catch (error) {
      logger.error('Failed to send magic link', { intent }, error as Error);
      res.status(500).json({ error: 'Failed to send magic link' });
    }
  }

  private async getSession(req: ExpressRequest): Promise<{ userId: string; email: string } | null> {
    try {
      const session = await this.sessionService.getSession(req);
      if (!session) return null;
      return { userId: session.user.id, email: session.user.email };
    } catch {
      return null;
    }
  }

  async passwordSetupPage(
    req: ExpressRequest,
    res: ExpressResponse
  ): Promise<void | ExpressResponse> {
    const queryIntent: MagicLinkIntent =
      req.query?.intent === 'reset'
        ? 'reset'
        : req.query?.intent === 'signup'
          ? 'signup'
          : undefined;
    const resetToken = typeof req.query?.token === 'string' ? req.query.token : '';
    const intent: MagicLinkIntent = resetToken || queryIntent === 'reset' ? 'reset' : 'signup';

    const errorMessage = typeof req.query?.error === 'string' ? req.query.error : undefined;
    const infoMessage = typeof req.query?.info === 'string' ? req.query.info : undefined;

    if (resetToken) {
      res.send(
        TemplateService.renderPasswordSetup({
          intent,
          resetToken,
          errorMessage,
          infoMessage,
        })
      );
      return;
    }

    const session = await this.getSession(req);
    if (!session) {
      return res.redirect(
        `${AUTH_BASE_PATH}${ProtocolRoute.SIGN_IN}?error=${encodeURIComponent('Session expired. Please sign in again.')}`
      );
    }

    res.send(
      TemplateService.renderPasswordSetup({
        userEmail: session.email,
        intent,
        errorMessage,
        infoMessage,
      })
    );
  }

  async setPassword(req: ExpressRequest, res: ExpressResponse): Promise<void | ExpressResponse> {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const intent: MagicLinkIntent = req.body?.intent === 'reset' ? 'reset' : 'signup';
    const resetToken = typeof req.body?.token === 'string' ? req.body.token : '';

    if (!password || password.length < 8) {
      return res
        .status(400)
        .json({ error: 'Password is required and must be at least 8 characters.' });
    }
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasDigit = /\d/.test(password);
    if (!(hasUpper && hasLower && hasDigit)) {
      return res.status(400).json({
        error: 'Password must include uppercase, lowercase letters and a number.',
      });
    }

    if (intent === 'reset' || resetToken) {
      if (!resetToken) {
        return res.status(400).json({ error: 'Reset link is invalid or has expired.' });
      }
      try {
        await this.auth.api.resetPassword({
          body: { newPassword: password, token: resetToken },
          headers: convertExpressHeaders(req),
        });
        clearBetterAuthCookies(res, req);
        return res.redirect(`${AUTH_BASE_PATH}/password/success`);
      } catch (error) {
        logger.error('Failed to reset password', { intent }, error as Error);
        return res.status(400).json({ error: 'Reset link is invalid or has expired.' });
      }
    }

    const session = await this.getSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    }

    try {
      await this.auth.api.setPassword({
        body: { newPassword: password },
        headers: convertExpressHeaders(req),
      });

      try {
        await this.auth.api.signOut({ headers: convertExpressHeaders(req) });
      } catch (signOutError) {
        logger.warn('Failed to sign out after password setup', {}, signOutError as Error);
      }

      clearBetterAuthCookies(res, req);
      return res.redirect(`${AUTH_BASE_PATH}/password/success`);
    } catch (error) {
      logger.error('Failed to set password', {}, error as Error);
      return res.status(400).json({ error: 'Failed to set password. Please try again.' });
    }
  }

  async passwordSuccessPage(_req: ExpressRequest, res: ExpressResponse): Promise<void> {
    res.send(TemplateService.renderPasswordSuccess());
  }

  registerRoutes(express: Express): void {
    express.post(`${AUTH_BASE_PATH}/api/magic-link`, this.sendMagicLink.bind(this));
    express.get(`${AUTH_BASE_PATH}/password/setup`, this.passwordSetupPage.bind(this));
    express.post(`${AUTH_BASE_PATH}/password/setup`, this.setPassword.bind(this));
    express.get(`${AUTH_BASE_PATH}/password/success`, this.passwordSuccessPage.bind(this));
  }
}
