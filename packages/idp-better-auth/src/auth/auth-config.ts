import { betterAuth } from 'better-auth';
import { magicLink, organization } from 'better-auth/plugins';
import { BetterAuthConfig } from '../types/index.js';
import { createAccessControl } from 'better-auth/plugins/access';
import { LoggerFactory, LogLevel } from '@owox/internal-helpers';

export async function createBetterAuthConfig(
  config: BetterAuthConfig,
  options?: { adapter?: unknown }
): Promise<ReturnType<typeof betterAuth>> {
  const logger = LoggerFactory.createNamedLogger('better-auth');
  const database = options?.adapter;

  const plugins: unknown[] = [];

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

          (
            global as unknown as {
              lastMagicLink: string;
              lastEmail: string;
              lastToken: string;
            }
          ).lastMagicLink = preConfirmPage.toString();
        } catch {
          (
            global as unknown as {
              lastMagicLink: string;
              lastEmail: string;
              lastToken: string;
            }
          ).lastMagicLink = url;
        }
        (
          global as unknown as {
            lastMagicLink: string;
            lastEmail: string;
            lastToken: string;
          }
        ).lastEmail = email;
        (
          global as unknown as {
            lastMagicLink: string;
            lastEmail: string;
            lastToken: string;
          }
        ).lastToken = token;
      },
      expiresIn: config.magicLinkTtl || 3600, // 1 hour
      disableSignUp: false,
    })
  );

  const ac = createAccessControl({
    project: ['create', 'update', 'delete', 'view'],
  });

  const adminRole = ac.newRole({
    project: ['create', 'update', 'delete', 'view'],
  });

  const editorRole = ac.newRole({
    project: ['create', 'update', 'delete', 'view'],
  });

  const viewerRole = ac.newRole({
    project: ['view'],
  });

  plugins.push(
    organization({
      ac,
      roles: {
        admin: adminRole,
        editor: editorRole,
        viewer: viewerRole,
      },
      allowUserToCreateOrganization: false,
      organizationLimit: 1,
      async sendInvitationEmail(_data) {
        return;
      },
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
      requireEmailVerification: false,
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
    basePath: '/auth/better-auth',
  } as Record<string, unknown>;

  return betterAuth(authConfig);
}
