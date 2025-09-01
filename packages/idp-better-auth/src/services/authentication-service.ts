import { createBetterAuthConfig } from '../auth/auth-config.js';
import { CryptoService } from './crypto-service.js';
import { AuthSession, SessionValidationResult } from '../types/auth-session.js';
import { type Request, type Response, type NextFunction } from 'express';
import type { UserManagementService } from './user-management-service.js';

export class AuthenticationService {
  private userManagementService?: UserManagementService;

  constructor(
    private readonly auth: Awaited<ReturnType<typeof createBetterAuthConfig>>,
    private readonly cryptoService: CryptoService
  ) {}

  setUserManagementService(userManagementService: UserManagementService): void {
    this.userManagementService = userManagementService;
  }

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
      console.error('Failed to get session:', error);
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
      console.error('Sign-in failed:', error);
      throw new Error('Sign-in failed');
    }
  }

  async signOut(req: Request): Promise<void> {
    try {
      await this.auth.api.signOut({
        headers: req.headers as unknown as Headers,
      });
    } catch (error) {
      console.error('Sign-out failed:', error);
      throw new Error('Sign-out failed');
    }
  }

  async generateAccessToken(req: Request): Promise<string> {
    try {
      const session = await this.getSession(req);
      if (!session) {
        console.error('No session found for access token generation');
        throw new Error('No session found');
      }

      const cookies = req.headers.cookie || '';
      const sessionTokenMatch = cookies.match(/refreshToken=([^;]+)/);
      const sessionToken =
        sessionTokenMatch && sessionTokenMatch[1] ? decodeURIComponent(sessionTokenMatch[1]) : null;

      if (!sessionToken) {
        console.error('No session token found in cookies');
        throw new Error('No session token found');
      }

      return await this.cryptoService.encrypt(sessionToken);
    } catch (error) {
      console.error('Failed to generate access token:', error);
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
        response.headers.forEach((value: string, key: string) => {
          res.set(key, value);
        });
        return res.redirect('/');
      } else {
        // Redirect back to sign-in page with error message
        const errorMessage =
          response.status === 401
            ? 'Invalid email or password. Please try again.'
            : 'Sign in failed. Please try again.';
        return res.redirect(`/auth/sign-in?error=${encodeURIComponent(errorMessage)}`);
      }
    } catch (error) {
      console.error('Sign-in middleware error:', error);
      const errorMessage = 'An error occurred during sign in. Please try again.';
      return res.redirect(`/auth/sign-in?error=${encodeURIComponent(errorMessage)}`);
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
      console.error('Sign-out middleware error:', error);
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
      console.error('Access token middleware error:', error);
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  async setPassword(password: string, req: Request): Promise<unknown> {
    try {
      return await this.auth.api.setPassword({
        body: {
          newPassword: password,
        },
        headers: req.headers as unknown as Headers,
      });
    } catch (error: unknown) {
      // Don't log error if user already has a password - this is expected behavior
      if (error && typeof error === 'object' && 'body' in error) {
        const apiError = error as { body?: { code?: string } };
        if (apiError.body?.code === 'USER_ALREADY_HAS_A_PASSWORD') {
          throw new Error('User already has a password');
        }
      }
      console.error('Failed to set password:', error);
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
        const currentPath = encodeURIComponent(req.originalUrl || req.url);
        return res.redirect(`/auth/sign-in?redirect=${currentPath}`);
      }
      const role = await this.userManagementService?.getUserRole(session.user.id);
      if (role && role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
      }

      next();
    } catch (error) {
      console.error('Authentication middleware error:', error);
      return res.redirect('/auth/sign-in');
    }
  }
}
