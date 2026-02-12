import { LoggerFactory, LogLevel } from '@owox/internal-helpers';
import { betterAuth } from 'better-auth';
import { BETTER_AUTH_SESSION_COOKIE } from '../core/constants.js';
import { GoogleProvider } from '../social/google-provider.js';
import { BetterAuthConfig } from '../types/index.js';

/**
 * Builds Better Auth configuration with social providers and cookies.
 */
export async function createBetterAuthConfig(
  config: BetterAuthConfig,
  options?: { adapter?: unknown }
): Promise<ReturnType<typeof betterAuth>> {
  const logger = LoggerFactory.createNamedLogger('better-auth');
  const database = options?.adapter;

  const basePath = '/auth/better-auth';

  const calcBaseURL = config.baseURL || 'http://localhost:3000';
  const trustedOrigins =
    config.trustedOrigins && config.trustedOrigins.length > 0
      ? config.trustedOrigins
      : [calcBaseURL];

  const authConfig: Record<string, unknown> = {
    database,
    session: {
      expiresIn: config.session?.maxAge || 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    trustedOrigins: Array.from(new Set(trustedOrigins)),
    baseURL: calcBaseURL,
    secret: config.secret,
    emailAndPassword: {
      enabled: false,
    },
    advanced: {
      cookies: {
        session_token: {
          name: BETTER_AUTH_SESSION_COOKIE,
          attributes: {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            secure: isSecureBaseURL(calcBaseURL),
          },
        },
      },
    },
    logger: {
      disabled: false,
      disableColors: true,
      level: 'error',
      log: (level: string, message: string, ...args: unknown[]) => {
        switch (level) {
          case 'error':
            logger.log(LogLevel.ERROR, message, { args });
            break;
          case 'warn':
            logger.log(LogLevel.WARN, message, { args });
            break;
          case 'info':
            logger.log(LogLevel.INFO, message, { args });
            break;
          case 'debug':
            logger.log(LogLevel.DEBUG, message, { args });
            break;
          default:
            logger.log(LogLevel.INFO, message, { args });
        }
      },
    },
    telemetry: { enabled: false },
    basePath,
  } as Record<string, unknown>;

  const defaultRedirect = (provider: string): string =>
    `${calcBaseURL.replace(/\/$/, '')}${basePath}/callback/${provider}`;

  const providerLogger = {
    log: (level: LogLevel, message: string, meta?: Record<string, unknown>) =>
      logger.log(level, message, meta),
  };

  const socialProviders = buildSocialProviders(config, providerLogger, defaultRedirect);
  if (socialProviders) authConfig.socialProviders = socialProviders;

  return betterAuth(authConfig);
}

function isLocalhost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function isSecureBaseURL(baseURL: string): boolean {
  try {
    const url = new URL(baseURL);
    return url.protocol === 'https:' && !isLocalhost(url.hostname);
  } catch {
    return false;
  }
}

function buildSocialProviders(
  config: BetterAuthConfig,
  providerLogger: {
    log: (level: LogLevel, message: string, meta?: Record<string, unknown>) => void;
  },
  redirectBuilder: (provider: string) => string
): Record<string, unknown> | undefined {
  if (!config.socialProviders) return undefined;

  const providers: Record<string, unknown> = {};

  if (config.socialProviders.google) {
    const googleProvider = new GoogleProvider({
      ...config.socialProviders.google,
      redirectURI: config.socialProviders.google.redirectURI ?? redirectBuilder('google'),
      logger: providerLogger,
    });
    providers.google = googleProvider.buildConfig();
  }

  return Object.keys(providers).length ? providers : undefined;
}
