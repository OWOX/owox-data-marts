import { betterAuth } from 'better-auth';
import { magicLink, organization } from 'better-auth/plugins';
import { BetterAuthConfig } from '../types/index.js';
import { createDatabaseAdapter } from '../adapters/database.js';
import { createAccessControl } from 'better-auth/plugins/access';

export async function createBetterAuthConfig(
  config: BetterAuthConfig
): Promise<ReturnType<typeof betterAuth>> {
  const database = await createDatabaseAdapter(config.database);

  const plugins: unknown[] = [];

  plugins.push(
    magicLink({
      sendMagicLink: async ({ email, token, url }) => {
        (
          global as unknown as {
            lastMagicLink: string;
            lastEmail: string;
            lastToken: string;
          }
        ).lastMagicLink = url;
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
      expiresIn: 3600, // 1 hour
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

  const authConfig: Record<string, unknown> = {
    database,
    plugins,
    session: {
      expiresIn: config.session?.maxAge || 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    trustedOrigins: config.baseURL ? [config.baseURL] : ['http://localhost:3000'],
    baseURL: config.baseURL || 'http://localhost:3000',
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
            secure: true,
          },
        },
      },
    },
    basePath: '/auth/better-auth',
  } as Record<string, unknown>;

  return betterAuth(authConfig);
}
