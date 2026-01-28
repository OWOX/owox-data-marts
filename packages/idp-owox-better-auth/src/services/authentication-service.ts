import { type NextFunction, type Request, type Response } from 'express';
import { createBetterAuthConfig } from '../auth/auth-config.js';
import { logger } from '../logger.js';
import type { DatabaseStore } from '../store/DatabaseStore.js';
import { AuthSession, SessionValidationResult } from '../types/auth-session.js';
import { CryptoService } from './crypto-service.js';
import { MagicLinkService } from './magic-link-service.js';
export class AuthenticationService {
  constructor(
    private readonly auth: Awaited<ReturnType<typeof createBetterAuthConfig>>,
    private readonly cryptoService: CryptoService,
    private readonly magicLinkService: MagicLinkService,
    private readonly store: DatabaseStore
  ) {}

  async getSession(req: Request): Promise<AuthSession | null> {
    try {
      const session = await this.auth.api.getSession({
        headers: req.headers as unknown as Headers,
      });

      if (!session || !session.user || !session.session) {
        return null;
      }

      return {
        user: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
        },
        session: {
          id: session.session.id,
          userId: session.session.userId,
          token: session.session.token,
          expiresAt: session.session.expiresAt,
        },
      };
    } catch (error) {
      logger.error('Failed to get session', {}, error as Error);
      throw new Error('Failed to get session');
    }
  }

  async signIn(
    email: string,
    password: string,
    protocol: string,
    host: string
  ): Promise<globalThis.Response> {
    try {
      const url = `${protocol}://${host}/auth/better-auth/sign-in/email`;
      const headers = new Headers();
      headers.set('Content-Type', 'application/json');

      const request = new Request(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email, password }),
      });

      const response = await this.auth.handler(request);
      return response;
    } catch (error) {
      logger.error('Sign-in failed', { email }, error as Error);
      throw new Error('Sign-in failed');
    }
  }

  async signOut(req: Request): Promise<void> {
    try {
      await this.auth.api.signOut({
        headers: req.headers as unknown as Headers,
      });
    } catch (error) {
      logger.error('Sign-out failed', {}, error as Error);
      throw new Error('Sign-out failed');
    }
  }

  async generateAccessToken(req: Request): Promise<string> {
    try {
      const session = await this.getSession(req);
      if (!session) {
        logger.error('No session found for access token generation');
        throw new Error('No session found');
      }

      const cookies = req.headers.cookie || '';
      const sessionTokenMatch = cookies.match(/refreshToken=([^;]+)/);
      const sessionToken =
        sessionTokenMatch && sessionTokenMatch[1] ? decodeURIComponent(sessionTokenMatch[1]) : null;

      if (!sessionToken) {
        logger.error('No session token found in cookies');
        throw new Error('No session token found');
      }

      return await this.cryptoService.encrypt(sessionToken);
    } catch (error) {
      logger.error('Failed to generate access token', {}, error as Error);
      throw new Error('Failed to generate access token');
    }
  }

  async validateSession(req: Request): Promise<SessionValidationResult> {
    try {
      const session = await this.getSession(req);

      if (!session) {
        return {
          isValid: false,
          error: 'No valid session found',
        };
      }

      return {
        isValid: true,
        session,
      };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Session validation failed',
      };
    }
  }

  async signInMiddleware(
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void | Response> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const response = await this.signIn(
        email,
        password,
        req.protocol,
        req.get('host') || 'localhost'
      );

      if (response.ok) {
        console.log('User authenticated (no session issued)', { email });
        logger.info('User authenticated (no session issued)', { email });
        return res
          .status(200)
          .send('Authentication completed. Session/token issuance is disabled.');
      } else {
        // Redirect back to sign-in page with error message
        const errorMessage =
          response.status === 401
            ? 'Invalid email or password. Please try again.'
            : 'Sign in failed. Please try again.';
        return res.redirect(`/auth/sign-in?error=${encodeURIComponent(errorMessage)}`);
      }
    } catch (error) {
      logger.error('Sign-in middleware error', {}, error as Error);
      const errorMessage = 'An error occurred during sign in. Please try again.';
      return res.redirect(`/auth/sign-in?error=${encodeURIComponent(errorMessage)}`);
    }
  }

  async signUpMiddleware(
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void | Response> {
    try {
      const { email, redirect: redirectParam } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      const magicLink = await this.magicLinkService.generateMagicLink(email);

      // TODO: Remove this after send email with magic link is implemented
      console.log('Generated magic link for signup', { email, magicLink });
      logger.info('Generated magic link for signup', { email, magicLink });

      return res.redirect(
        `/auth/check-email?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(
          redirectParam || '/'
        )}`
      );
    } catch (error) {
      logger.error('Sign-up middleware error', {}, error as Error);
      const errorMessage = 'An error occurred during sign up. Please try again.';
      return res.redirect(`/auth/sign-up?error=${encodeURIComponent(errorMessage)}`);
    }
  }

  async passwordRemindMiddleware(
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void | Response> {
    try {
      const { email, redirect: redirectParam } = req.body;

      if (!email) {
        return res.redirect(
          `/auth/password-remind?error=${encodeURIComponent('Email is required')}`
        );
      }

      const magicLink = await this.magicLinkService.generateMagicLink(email);
      logger.info('Generated magic link for password remind', { email, magicLink });

      return res.redirect(
        `/auth/check-email?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(
          redirectParam || '/'
        )}`
      );
    } catch (error) {
      logger.error('Password remind middleware error', {}, error as Error);
      const errorMessage = 'We could not send the reset link. Please try again.';
      return res.redirect(`/auth/password-remind?error=${encodeURIComponent(errorMessage)}`);
    }
  }

  async signOutMiddleware(
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void | Response> {
    try {
      await this.signOut(req);

      res.clearCookie('refreshToken');
      res.clearCookie('better-auth.csrf_token');

      const redirectPath = (req.query.redirect as string) || '/auth/sign-in';

      return res.redirect(redirectPath);
    } catch (error) {
      logger.error('Sign-out middleware error', {}, error as Error);
      return res.status(500).json({ error: 'Sign-out failed' });
    }
  }

  async accessTokenMiddleware(
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void | Response> {
    try {
      const validation = await this.validateSession(req);

      if (!validation.isValid) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const accessToken = await this.generateAccessToken(req);

      return res.json({ accessToken });
    } catch (error) {
      logger.error('Access token middleware error', {}, error as Error);
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  private isUserAlreadyHasPassword(error: unknown): boolean {
    if (error && typeof error === 'object' && 'body' in error) {
      const apiError = error as { body?: { code?: string } };
      return apiError.body?.code === 'USER_ALREADY_HAS_A_PASSWORD';
    }
    return false;
  }

  async setPassword(password: string, req: Request, userId?: string): Promise<unknown> {
    const targetUserId = userId || (await this.getSession(req))?.user?.id;

    try {
      return await this.auth.api.setPassword({
        body: {
          newPassword: password,
        },
        headers: req.headers as unknown as Headers,
      });
    } catch (error: unknown) {
      if (this.isUserAlreadyHasPassword(error) && targetUserId) {
        try {
          await this.store.clearUserPassword(targetUserId);
          const response = await this.auth.api.setPassword({
            body: {
              newPassword: password,
            },
            headers: req.headers as unknown as Headers,
          });
          try {
            await this.store.revokeUserSessions(targetUserId);
          } catch (sessionError) {
            logger.warn(
              'Failed to revoke existing sessions after password reset',
              { userId: targetUserId },
              sessionError as Error
            );
          }
          return response;
        } catch (retryError) {
          logger.error(
            'Failed to reset password after clearing existing credential',
            { userId: targetUserId },
            retryError as Error
          );
          throw new Error('Failed to update password');
        }
      }

      logger.error('Failed to set password', {}, error as Error);
      throw new Error('Failed to set password');
    }
  }

  async requireAuthMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    try {
      const session = await this.getSession(req);

      if (!session || !session.user) {
        console.log('session', session);
        const currentPath = encodeURIComponent(req.originalUrl || req.url);
        return res.redirect(`/auth/sign-in?redirect=${currentPath}`);
      }

      next();
    } catch (error) {
      console.log('error in requireAuthMiddleware', error);
      logger.error('Authentication middleware error', {}, error as Error);
      return res.redirect('/auth/sign-in');
    }
  }
}
