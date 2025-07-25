import { Request, Response } from 'express';
import {
  AUTH_PAGE_ROUTES,
  AuthPageHandler,
  SignInPageRequest,
  SignOutPageRequest,
  SignUpPageRequest,
  MagicLinkPageRequest,
  MagicLinkVerifyPageRequest,
  GoogleCallbackPageRequest,
  MicrosoftCallbackPageRequest,
} from '@owox/idp-protocol';
import { BetterAuthProvider } from '../providers/better-auth-provider.js';

/**
 * Authentication page handlers for Better Auth
 * These handle GET requests and render HTML pages or handle redirects
 */
export class BetterAuthPageHandlers {
  constructor(private provider: BetterAuthProvider) {}

  /**
   * Sign in page handler
   * GET /auth/sign-in
   */
  signInPage: AuthPageHandler<SignInPageRequest> = async (req, res) => {
    // Check if user is already authenticated
    const sessionToken = this.extractSessionToken(req);
    if (sessionToken) {
      const session = await this.provider.getSessionManagement().getActive(sessionToken);
      if (session) {
        res.redirect('/');
        return;
      }
    }

    // Render sign-in page or return JSON for API clients
    if (req.headers.accept?.includes('application/json')) {
      res.json({
        page: 'sign-in',
        action: AUTH_PAGE_ROUTES.SIGN_IN,
        methods: ['email', 'google', 'microsoft'],
      });
      return;
    } else {
      // For HTML clients, you would render a template
      res.send(`
        <html>
          <head><title>Sign In</title></head>
          <body>
            <h1>Sign In</h1>
            <form method="post" action="/auth/api/sign-in">
              <input type="email" name="email" placeholder="Email" required />
              <input type="password" name="password" placeholder="Password" required />
              <button type="submit">Sign In</button>
            </form>
            <a href="/auth/google/callback">Sign in with Google</a>
          </body>
        </html>
      `);
      return;
    }
  };

  /**
   * Sign out page handler
   * GET /auth/sign-out
   */
  signOutPage: AuthPageHandler<SignOutPageRequest> = async (req, res) => {
    // Perform sign out
    const sessionToken = this.extractSessionToken(req);
    if (sessionToken) {
      await this.provider.signOut('current-user');
    }

    // Clear session cookie
    res.clearCookie('better-auth.session_token');

    if (req.headers.accept?.includes('application/json')) {
      res.json({ success: true, message: 'Signed out successfully' });
      return;
    } else {
      res.send(`
        <html>
          <head><title>Signed Out</title></head>
          <body>
            <h1>You have been signed out</h1>
            <a href="/auth/sign-in">Sign in again</a>
          </body>
        </html>
      `);
      return;
    }
  };

  /**
   * Sign up page handler
   * GET /auth/sign-up
   */
  signUpPage: AuthPageHandler<SignUpPageRequest> = async (req, res) => {
    if (req.headers.accept?.includes('application/json')) {
      res.json({
        page: 'sign-up',
        action: '/auth/api/sign-up',
        fields: ['email', 'password', 'name'],
      });
      return;
    } else {
      res.send(`
        <html>
          <head><title>Sign Up</title></head>
          <body>
            <h1>Sign Up</h1>
            <form method="post" action="/auth/api/sign-up">
              <input type="text" name="name" placeholder="Full Name" />
              <input type="email" name="email" placeholder="Email" required />
              <input type="password" name="password" placeholder="Password" required />
              <button type="submit">Sign Up</button>
            </form>
          </body>
        </html>
      `);
      return;
    }
  };

  /**
   * Magic link page handler
   * GET /auth/magic-link
   */
  magicLinkPage: AuthPageHandler<MagicLinkPageRequest> = async (req, res) => {
    if (req.headers.accept?.includes('application/json')) {
      res.json({
        page: 'magic-link',
        action: '/auth/api/magic-link',
        description: 'Enter your email to receive a magic link',
      });
      return;
    } else {
      res.send(`
        <html>
          <head><title>Magic Link</title></head>
          <body>
            <h1>Sign in with Magic Link</h1>
            <form method="post" action="/auth/api/magic-link">
              <input type="email" name="email" placeholder="Email" required />
              <button type="submit">Send Magic Link</button>
            </form>
          </body>
        </html>
      `);
      return;
    }
  };

  /**
   * Magic link verification handler
   * GET /auth/magic-link/verify?token=...
   */
  magicLinkVerifyPage: AuthPageHandler<MagicLinkVerifyPageRequest> = async (req, res) => {
    const token = req.query.token as string;
    if (!token) {
      res.status(400).json({ error: 'Token required' });
      return;
    }

    try {
      // Better Auth handles magic link verification internally
      // This would typically redirect to the Better Auth handler
      res.redirect(`/api/auth/sign-in/magic-link/verify?token=${token}`);
      return;
    } catch (error) {
      res.status(400).send(`
        <html>
          <head><title>Invalid Link</title></head>
          <body>
            <h1>Invalid or Expired Link</h1>
            <p>The magic link is invalid or has expired.</p>
            <a href="/auth/magic-link">Request a new magic link</a>
          </body>
        </html>
      `);
    }
  };

  /**
   * Google OAuth callback handler
   * GET /auth/google/callback
   */
  googleCallbackPage: AuthPageHandler<GoogleCallbackPageRequest> = async (req, res) => {
    // Better Auth handles OAuth callbacks internally
    // This would typically redirect to Better Auth's Google handler
    res.redirect('/api/auth/sign-in/google');
    return;
  };

  /**
   * Microsoft OAuth callback handler
   * GET /auth/microsoft/callback
   */
  microsoftCallbackPage: AuthPageHandler<MicrosoftCallbackPageRequest> = async (req, res) => {
    // Better Auth handles OAuth callbacks internally
    // This would typically redirect to Better Auth's Microsoft handler
    res.redirect('/api/auth/sign-in/microsoft');
    return;
  };

  /**
   * Extract session token from request
   */
  private extractSessionToken(req: Request): string | null {
    // Try cookie first
    const cookieToken = req.cookies?.['better-auth.session_token'];
    if (cookieToken) return cookieToken;

    // Try Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return null;
  }
}
