import { LogLevel } from '@owox/internal-helpers';
import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import {
  AUTH_BASE_PATH,
  BETTER_AUTH_BASE_PATH,
  BETTER_AUTH_SESSION_COOKIE,
} from '../core/constants.js';
import { createServiceLogger } from '../core/logger.js';
import { GoogleProvider } from '../social/google-provider.js';
import { MicrosoftProvider } from '../social/microsoft-provider.js';
import { BetterAuthConfig } from '../types/index.js';
import { resolveNameWithFallback } from '../utils/email-utils.js';
import { isSecureOrigin } from '../utils/url-utils.js';

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
  const betterAuthLogger = createServiceLogger('BetterAuth');
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

  const basePath = BETTER_AUTH_BASE_PATH;

  const trustedOrigins = Array.from(
    new Set([
      ...(config.trustedOrigins && config.trustedOrigins.length > 0
        ? config.trustedOrigins
        : [config.baseURL]),
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
    baseURL: config.baseURL,
    secret: config.secret,
    emailAndPassword: emailAndPasswordConfig,
    databaseHooks: {
      user: {
        create: {
          before: async (user: Record<string, unknown>) => {
            const resolvedName = resolveNameWithFallback(user.name, user.email);
            if (!resolvedName) {
              return;
            }
            return {
              data: {
                ...user,
                name: resolvedName,
              },
            };
          },
        },
      },
    },
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
            secure: isSecureBaseURL(config.baseURL),
          },
        },
      },
    },
    logger: {
      disabled: false,
      disableColors: true,
      level: 'error',
      log: (level: string, message: string, ...args: unknown[]) => {
        const BA_LOG_LEVEL_MAP: Record<string, LogLevel> = {
          error: LogLevel.ERROR,
          warn: LogLevel.WARN,
          info: LogLevel.INFO,
          debug: LogLevel.DEBUG,
        };
        const logLevel = BA_LOG_LEVEL_MAP[level] ?? LogLevel.INFO;
        betterAuthLogger.log(logLevel, message, { source: 'better-auth-internal', args });
      },
    },
    onAPIError: {
      errorURL: `${AUTH_BASE_PATH}/error`,
    },
    telemetry: { enabled: false },
    basePath,
  } as Record<string, unknown>;

  const defaultRedirect = (provider: string): string =>
    `${config.baseURL.replace(/\/$/, '')}${basePath}/callback/${provider}`;

  const socialProviders = buildSocialProviders(config, defaultRedirect);
  if (socialProviders) authConfig.socialProviders = socialProviders;

  plugins.push(
    magicLink({
      sendMagicLink: async ({ email, token, url }) => {
        const sender = options?.magicLinkSender;
        if (!sender) {
          betterAuthLogger.error('Magic link sender is not configured');
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

function isSecureBaseURL(baseURL: string): boolean {
  try {
    const url = new URL(baseURL);
    return isSecureOrigin(url.protocol, url.hostname);
  } catch {
    return false;
  }
}

function buildSocialProviders(
  config: BetterAuthConfig,
  redirectBuilder: (provider: string) => string
): Record<string, unknown> | undefined {
  if (!config.socialProviders) return undefined;

  const providers: Record<string, unknown> = {};

  if (config.socialProviders.google) {
    const googleProvider = new GoogleProvider({
      ...config.socialProviders.google,
      redirectURI: config.socialProviders.google.redirectURI ?? redirectBuilder('google'),
    });
    providers.google = googleProvider.buildConfig();
  }

  if (config.socialProviders.microsoft) {
    const microsoftProvider = new MicrosoftProvider({
      ...config.socialProviders.microsoft,
      redirectURI: config.socialProviders.microsoft.redirectURI ?? redirectBuilder('microsoft'),
    });
    providers.microsoft = microsoftProvider.buildConfig();
  }

  return Object.keys(providers).length ? providers : undefined;
}
