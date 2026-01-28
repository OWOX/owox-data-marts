import { LoggerFactory, LogLevel } from '@owox/internal-helpers';
import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import { EmailService } from '../services/email-service.js';
import { BetterAuthConfig } from '../types/index.js';

export async function createBetterAuthConfig(
  config: BetterAuthConfig,
  options?: { adapter?: unknown }
): Promise<ReturnType<typeof betterAuth>> {
  const logger = LoggerFactory.createNamedLogger('better-auth');
  const emailService = new EmailService();
  const database = options?.adapter;

  const plugins: unknown[] = [];
  const basePath = '/auth/better-auth';
  const mapProfileToUser =
    (provider: 'google' | 'microsoft') => (profile: Record<string, unknown>) => {
      logger.log(LogLevel.INFO, `${provider}-profile`, { profile });
      return {
        email: (profile as { email?: string }).email,
        name:
          (profile as { name?: string }).name ||
          (profile as { displayName?: string }).displayName ||
          (profile as { given_name?: string }).given_name ||
          null,
        image:
          (profile as { picture?: string }).picture ||
          (profile as { image?: string }).image ||
          null,
        emailVerified: Boolean(
          (profile as { email_verified?: boolean }).email_verified ||
          (profile as { verified_email?: boolean }).verified_email ||
          (profile as { emailVerified?: boolean }).emailVerified
        ),
      };
    };

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

          await emailService.sendEmail(
            email,
            'Your sign-in link',
            `<p>Click the button to continue:</p><p><a href="${preConfirmPage.toString()}">${preConfirmPage.toString()}</a></p>`
          );
        } catch (error) {
          logger.error('Failed to send magic link', { error });
        }
      },
      expiresIn: config.magicLinkTtl,
      disableSignUp: false,
    })
  );

  const calcBaseURL = config.baseURL || `http://localhost:${process.env.PORT || '3000'}`;
  const authConfig: Record<string, unknown> = {
    database,
    plugins,
    session: {
      expiresIn: config.session?.maxAge || 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    trustedOrigins: [calcBaseURL, ...(config.trustedOrigins || [])],
    baseURL: calcBaseURL,
    secret: config.secret,
    emailAndPassword: {
      enabled: true,
      // New users must verify email before they can sign in
      requireEmailVerification: true,
      // Prevent automatic sign-in on signup until verification is done
      autoSignIn: false,
    },
    emailVerification: {
      // Send verification email via callback (stores link for tests)
      sendVerificationEmail: async ({
        user,
        url,
        token,
      }: {
        user: { email: string };
        url: string;
        token: string;
      }) => {
        const verificationLink =
          url || `${calcBaseURL}${basePath}/verify-email?token=${encodeURIComponent(token)}`;

        await emailService.sendEmail(
          user.email,
          'Verify your email',
          `<p>Please confirm your email address:</p><p><a href="${verificationLink}">${verificationLink}</a></p>`
        );
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

  const socialProviders: Record<string, unknown> = {};

  const defaultRedirect = (provider: string): string =>
    `${calcBaseURL.replace(/\/$/, '')}${basePath}/callback/${provider}`;

  if (config.socialProviders?.google?.clientId && config.socialProviders?.google?.clientSecret) {
    socialProviders.google = {
      clientId: config.socialProviders.google.clientId,
      clientSecret: config.socialProviders.google.clientSecret,
      redirectURI: config.socialProviders.google.redirectURI || defaultRedirect('google'),
      prompt: config.socialProviders.google.prompt || 'select_account',
      accessType: config.socialProviders.google.accessType || 'offline',
      mapProfileToUser: mapProfileToUser('google'),
    };
  }

  if (
    config.socialProviders?.microsoft?.clientId &&
    config.socialProviders?.microsoft?.clientSecret
  ) {
    socialProviders.microsoft = {
      clientId: config.socialProviders.microsoft.clientId,
      clientSecret: config.socialProviders.microsoft.clientSecret,
      redirectURI: config.socialProviders.microsoft.redirectURI || defaultRedirect('microsoft'),
      prompt: config.socialProviders.microsoft.prompt || 'select_account',
      ...(config.socialProviders.microsoft.tenantId
        ? { tenantId: config.socialProviders.microsoft.tenantId }
        : {}),
      ...(config.socialProviders.microsoft.authority
        ? { authority: config.socialProviders.microsoft.authority }
        : {}),
      mapProfileToUser: mapProfileToUser('microsoft'),
    };
  }

  if (Object.keys(socialProviders).length > 0) {
    authConfig.socialProviders = socialProviders;
  }

  return betterAuth(authConfig);
}
