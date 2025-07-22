import { Request, Response, NextFunction } from 'express';
import { IIdpProvider } from '../types/interfaces.js';
import { TokenPayload } from '../types/types.js';
import { AuthenticationError } from '../types/interfaces.js';

export interface AuthRequest extends Request {
  user?: TokenPayload;
  token?: string;
}

export function createAuthMiddleware(
  idpProvider: IIdpProvider,
  options: AuthMiddlewareOptions = {}
) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const token = extractToken(req);

      if (!token) {
        if (options.optional) {
          return next();
        }
        throw new AuthenticationError('No token provided');
      }

      // Skip introspection if disabled
      if (options.skipIntrospection) {
        const payload = decodeTokenWithoutVerification(token);
        if (payload) {
          req.user = payload;
          req.token = token;
          return next();
        }
      }

      // Verify token
      const payload = await idpProvider.verifyAccessToken(token);

      req.user = payload;
      req.token = token;

      next();
    } catch (error) {
      if (options.optional) {
        return next();
      }

      res.status(401).json({
        error: 'Unauthorized',
        message: error instanceof Error ? error.message : 'Authentication failed',
      });
    }
  };
}

export interface AuthMiddlewareOptions {
  optional?: boolean;
  skipIntrospection?: boolean;
}

function extractToken(req: Request): string | null {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check cookie
  if (req.cookies && req.cookies.access_token) {
    return req.cookies.access_token;
  }

  return null;
}

function decodeTokenWithoutVerification(token: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64').toString());

    // Basic validation
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
