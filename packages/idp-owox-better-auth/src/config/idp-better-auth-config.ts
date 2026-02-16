import { LoggerFactory, LogLevel } from '@owox/internal-helpers';
import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import { BETTER_AUTH_SESSION_COOKIE } from '../core/constants.js';
import { GoogleProvider } from '../social/google-provider.js';
import { BetterAuthConfig } from '../types/index.js';

/**
 * Builds Better Auth configuration with social providers and cookies.
 */
type MagicLinkSender = (params: { email: string; token: string; url: string }) => Promise<void>;
type ResetPasswordSender = (params: { email: string; token: string; url: string }) => Promise<void>;

type AuthOptions = {
  adapter?: unknown;
  magicLinkSender?: MagicLinkSender;
  resetPasswordSender?: ResetPasswordSender;
};

export async function createBetterAuthConfig(
  config: BetterAuthConfig,
  options?: AuthOptions
): Promise<ReturnType<typeof betterAuth>> {
  const logger = LoggerFactory.createNamedLogger('better-auth');
  const database = options?.adapter;
  const plugins: unknown[] = [];
  const emailAndPasswordConfig: Record<string, unknown> = {
    enabled: true,
    requireEmailVerification: false,
  };

  if (options?.resetPasswordSender) {
    emailAndPasswordConfig.sendResetPassword = async ({
      user,
      token,
      url,
    }: {
      user: { email: string };
      token: string;
      url: string;
    }) => {
      await options.resetPasswordSender?.({ email: user.email, token, url });
    };
    emailAndPasswordConfig.resetPasswordTokenExpiresIn = config.magicLinkTtl ?? 60 * 60;
  }

  const basePath = '/auth/better-auth';

  const calcBaseURL = config.baseURL || 'http://localhost:3000';
  const envPublicOrigin = process.env.PUBLIC_ORIGIN;
  const trustedOrigins = Array.from(
    new Set([
      ...(config.trustedOrigins && config.trustedOrigins.length > 0
        ? config.trustedOrigins
        : [calcBaseURL]),
      ...(envPublicOrigin ? [envPublicOrigin] : []),
    ])
  );

  const authConfig: Record<string, unknown> = {
    database,
    plugins,
    session: {
      expiresIn: config.session?.maxAge || 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    trustedOrigins: Array.from(new Set(trustedOrigins)),
    baseURL: calcBaseURL,
    secret: config.secret,
    emailAndPassword: emailAndPasswordConfig,
    user: {
      additionalFields: {
        lastLoginMethod: {
          type: 'string',
          required: false,
          input: false,
        },
      },
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

  plugins.push(
    magicLink({
      sendMagicLink: async ({ email, token, url }) => {
        const sender = options?.magicLinkSender;
        if (!sender) {
          logger.log(LogLevel.ERROR, 'Magic link sender is not configured');
          throw new Error('Magic link sender is not configured');
        }
        await sender({ email, token, url });
      },
      expiresIn: config.magicLinkTtl ?? 60 * 60,
      disableSignUp: false,
    })
  );

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
