import { Request, Response, NextFunction } from 'express';
import { BetterAuthProvider } from '../providers/better-auth-provider.js';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: any;
      session?: any;
    }
  }
}

export function createBetterAuthMiddleware(provider: BetterAuthProvider) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auth = provider.getBetterAuth();

    // Better Auth expects to handle requests directly
    // This middleware integrates Better Auth with Express
    try {
      // Create a Web API Request object
      const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      const authRequest = new globalThis.Request(url, {
        method: req.method,
        headers: new Headers(req.headers as Record<string, string>),
        body:
          req.method !== 'GET' && req.method !== 'HEAD' && req.body
            ? JSON.stringify(req.body)
            : undefined,
      });

      const response = await auth.handler(authRequest);

      if (response) {
        // If Better Auth handled the request, send the response
        res.status(response.status);

        // Set headers
        response.headers.forEach((value, key) => {
          res.set(key, value);
        });

        // Send body
        const body = await response.text();
        return res.send(body);
      }
    } catch (error) {
      // If Better Auth didn't handle this request, continue to next middleware
    }

    next();
  };
}

export function createAuthenticationMiddleware(provider: BetterAuthProvider) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check for session token in cookies
      const sessionToken =
        req.cookies?.['better-auth.session_token'] ||
        req.headers.authorization?.replace('Bearer ', '');

      if (!sessionToken) {
        return res.status(401).json({ error: 'No authentication token provided' });
      }

      // Get session from Better Auth
      const session = await provider.getCurrentSession(sessionToken);

      if (!session?.user || !session?.session) {
        return res.status(401).json({ error: 'Invalid or expired session' });
      }

      // Add user and session to request
      req.user = session.user;
      req.session = session.session;

      next();
    } catch (error) {
      return res.status(401).json({ error: 'Authentication failed' });
    }
  };
}

// Middleware to require email verification
export function requireEmailVerification() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user?.emailVerified) {
      return res.status(403).json({
        error: 'Email verification required',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }
    next();
  };
}

// Helper middleware to extract user from session token
export function extractUserFromSession(provider: BetterAuthProvider) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionToken = req.cookies?.['better-auth.session_token'];

      if (sessionToken) {
        const session = await provider.getCurrentSession(sessionToken);
        if (session?.user) {
          req.user = session.user;
          req.session = session.session;
        }
      }
    } catch (error) {
      // Ignore errors - this is optional user extraction
    }

    next();
  };
}
