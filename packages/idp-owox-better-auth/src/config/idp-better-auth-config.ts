import { LoggerFactory, LogLevel } from '@owox/internal-helpers';
import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import { GoogleProvider } from '../social/google-provider.js';
import { MicrosoftProvider } from '../social/microsoft-provider.js';
import { BetterAuthConfig } from '../types/index.js';

export async function createBetterAuthConfig(
  config: BetterAuthConfig,
  options?: { adapter?: unknown }
): Promise<ReturnType<typeof betterAuth>> {
  const logger = LoggerFactory.createNamedLogger('better-auth');
  const database = options?.adapter;

  const plugins: unknown[] = [];
  const basePath = '/auth/better-auth';
  plugins.push(
    magicLink({
      sendMagicLink: async ({ email, token, url }) => {
        try {
          const original = new URL(url);
          const tokenParam = original.searchParams.get('token') || token;
          const callbackParam = original.searchParams.get('callbackURL') || '';
          const preConfirmPage = new URL(original.origin);
          preConfirmPage.pathname = '/auth/magic-link';
          preConfirmPage.searchParams.set('token', tokenParam);
          if (callbackParam) {
            preConfirmPage.searchParams.set('callbackURL', callbackParam);
          }

          const link = preConfirmPage.toString();
          logger.info('Magic link logged instead of sent', { email, link });
        } catch (error) {
          logger.error('Failed to process magic link', { error });
        }
      },
      expiresIn: config.magicLinkTtl,
      // TODO: Set true after email sign up is implemented
      disableSignUp: true,
    })
  );

  const calcBaseURL = config.baseURL || `http://localhost:${process.env.PORT || '3000'}`;
  const trustedOrigins =
    config.trustedOrigins && config.trustedOrigins.length > 0
      ? config.trustedOrigins
      : [calcBaseURL];

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
    emailAndPassword: {
      enabled: false,
      requireEmailVerification: false,
      autoSignIn: false,
    },
    emailVerification: {
      sendVerificationEmail: async () => {
        logger.warn('Email verification is тимчасово вимкнено; посилання не відправляємо');
        return Promise.resolve();
      },
      afterEmailVerification: async () => {
        // No-op: higher-level org/role handling removed
        return Promise.resolve();
      },
    },
    advanced: {
      cookies: {
        session_token: {
          name: 'refreshToken',
          attributes: {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            secure:
              config.baseURL?.includes('localhost') ||
              config.baseURL?.includes('127.0.0.1') ||
              !config.baseURL?.startsWith('https://')
                ? false
                : true,
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
  if (socialProviders) {
    authConfig.socialProviders = socialProviders;
  }

  return betterAuth(authConfig);
}

function buildSocialProviders(
  config: BetterAuthConfig,
  providerLogger: { log: (level: LogLevel, message: string, meta?: Record<string, unknown>) => void },
  redirectBuilder: (provider: string) => string
): Record<string, unknown> | undefined {
  if (!config.socialProviders) return undefined;

  const providers: Record<string, unknown> = {};

  if (config.socialProviders.google) {
    const googleProvider = new GoogleProvider({
      ...config.socialProviders.google,
      redirectURI:
        config.socialProviders.google.redirectURI ?? redirectBuilder('google'),
      logger: providerLogger,
    });
    providers.google = googleProvider.buildConfig();
  }

  if (config.socialProviders.microsoft) {
    const microsoftProvider = new MicrosoftProvider({
      ...config.socialProviders.microsoft,
      redirectURI:
        config.socialProviders.microsoft.redirectURI ?? redirectBuilder('microsoft'),
      logger: providerLogger,
    });
    providers.microsoft = microsoftProvider.buildConfig();
  }

  return Object.keys(providers).length ? providers : undefined;
}
