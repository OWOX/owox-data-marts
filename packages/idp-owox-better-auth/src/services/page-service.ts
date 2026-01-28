import {
  type Express,
  type Request as ExpressRequest,
  type Response as ExpressResponse,
} from 'express';
import { logger } from '../logger.js';
import { AuthenticationService } from './authentication-service.js';
import { TemplateService } from './template-service.js';

export class PageService {
  constructor(private readonly authenticationService: AuthenticationService) {}

  async signInPage(_req: ExpressRequest, res: ExpressResponse): Promise<void> {
    res.send(TemplateService.renderSignIn());
  }

  async passwordRemindPage(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    const error = encodeURIComponent((req.query.error as string) || '');
    res.send(TemplateService.renderPasswordRemind(error));
  }

  async signUpPage(_req: ExpressRequest, res: ExpressResponse): Promise<void> {
    res.send(TemplateService.renderSignUp());
  }

  async checkEmailPage(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    const email = (req.query.email as string) || '';
    res.send(TemplateService.renderCheckEmail(email));
  }

  async setupPasswordPage(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    try {
      const session = await this.authenticationService.getSession(req);

      if (!session || !session.user) {
        res.redirect('/auth/sign-in?error=Invalid or expired magic link');
        return;
      }

      res.send(TemplateService.renderPasswordSetup());
    } catch (error) {
      logger.error('Error loading password setup page', {}, error as Error);
      res.redirect('/auth/sign-in');
    }
  }

  async setPassword(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    const { password, confirmPassword } = req.body;

    if (!password || password !== confirmPassword) {
      res.status(400).send('Passwords do not match');
      return;
    }

    try {
      const session = await this.authenticationService.getSession(req);

      if (!session || !session.user) {
        res.redirect('/auth/sign-in');
        return;
      }

      try {
        await this.authenticationService.setPassword(password, req, session.user.id);
        try {
          await this.authenticationService.signOut(req);
        } catch (error) {
          logger.warn('Failed to sign out after password set', {}, error as Error);
        }
        res.clearCookie('refreshToken');
        res.clearCookie('better-auth.csrf_token');
        res.clearCookie('better-auth.state');
        res.send(TemplateService.renderPasswordSuccess());
      } catch (error: unknown) {
        logger.error('Failed to set password', {}, error as Error);
        res.status(500).send('Failed to set password. Please try again.');
      }
    } catch (error) {
      logger.error('Password update failed', {}, error as Error);
      res.status(500).send('Failed to set password');
    }
  }

  async magicLinkConfirm(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    try {
      const token = (req.query.token as string) || '';
      const callbackURL = (req.query.callbackURL as string) || '';

      if (!token || !callbackURL) {
        res.redirect('/auth/sign-in?error=Invalid magic link');
        return;
      }

      const verifyUrl = `/auth/better-auth/magic-link/verify?token=${encodeURIComponent(
        token
      )}&callbackURL=${encodeURIComponent(callbackURL)}`;

      res.send(TemplateService.renderMagicLinkConfirm(verifyUrl));
    } catch (error) {
      logger.error('Error rendering magic link preconfirm page', {}, error as Error);
      res.redirect('/auth/sign-in?error=Something went wrong with the magic link');
    }
  }

  async magicLinkSuccess(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    try {
      if (req.query.error) {
        res.redirect(`/auth/sign-in?error=Magic link verification failed: ${req.query.error}`);
        return;
      }

      const session = await this.authenticationService.getSession(req);
      if (!session || !session.user) {
        res.redirect('/auth/sign-in?error=Invalid magic link session');
        return;
      }

      console.log('Magic link verified', {
        userId: session.user.id,
        email: session.user.email,
        callbackURL: req.query.callbackURL,
      });
      logger.info('Magic link verified', {
        userId: session.user.id,
        email: session.user.email,
        callbackURL: req.query.callbackURL,
      });

      res.redirect('/auth/setup-password');
    } catch (error) {
      logger.error('Magic link success handler failed', {}, error as Error);
      res.redirect('/auth/sign-in?error=Something went wrong');
    }
  }

  registerRoutes(express: Express): void {
    try {
      express.get('/auth/setup-password', this.setupPasswordPage.bind(this));
      express.post('/auth/set-password', this.setPassword.bind(this));
      express.get('/auth/magic-link-success', this.magicLinkSuccess.bind(this));
      express.get('/auth/password-remind', this.passwordRemindPage.bind(this));
      express.get('/auth/sign-up', this.signUpPage.bind(this));
      express.get('/auth/sign-in', this.signInPage.bind(this));
      express.get('/auth/check-email', this.checkEmailPage.bind(this));
      express.get('/auth/magic-link', this.magicLinkConfirm.bind(this));
      express.get('/auth', (_req, res) => res.redirect('/auth/sign-in'));
    } catch (error) {
      logger.error('Failed to register page routes', {}, error as Error);
      throw new Error('Failed to register page routes');
    }
  }
}
