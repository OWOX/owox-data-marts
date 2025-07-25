import { magicLink } from 'better-auth/plugins';
import { BetterAuthProvider } from '../providers/better-auth-provider.js';
import type { BetterAuthConfig } from '../types/index.js';
import type { IdpConfig } from '@owox/idp-protocol';

/**
 * Example configuration for SQLite database
 */
export function createSqliteConfig(): { idpConfig: IdpConfig; betterAuthConfig: BetterAuthConfig } {
  const idpConfig: IdpConfig = {
    magicLinkTTL: 3600, // 1 hour
    magicLinkBaseUrl: 'http://localhost:3000',
    defaultProjectId: 'default',
    requireEmailVerification: true,
  };

  const betterAuthConfig: BetterAuthConfig = {
    database: {
      type: 'sqlite',
      filename: './database.sqlite',
    },
    secret: process.env.BETTER_AUTH_SECRET || 'your-secret-key-here',
    baseURL: 'http://localhost:3000',
    trustedOrigins: ['http://localhost:3000'],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendEmailVerification: async (email: string, url: string, token: string) => {
        console.log(`Send email verification to ${email}: ${url}?token=${token}`);
        // Implement your email sending logic here
      },
    },
    magicLink: {
      enabled: true,
      sendMagicLink: async ({ email, url, token }) => {
        console.log(`Send magic link to ${email}: ${url}?token=${token}`);
        // Implement your magic link sending logic here
      },
    },
    session: {
      maxAge: 60 * 60 * 24 * 7, // 7 days
    },
  };

  return { idpConfig, betterAuthConfig };
}

/**
 * Example usage with BetterAuthProvider
 */
export async function createSqliteProvider(): Promise<BetterAuthProvider> {
  const { idpConfig, betterAuthConfig } = createSqliteConfig();

  // Define which capabilities this provider supports
  const capabilities = {
    authPages: {
      signIn: true,
      signOut: true,
      signUp: true,
      magicLink: true,
    },
    authApi: {
      tokenRefresh: true,
      tokenRevoke: true,
      tokenIntrospection: true,
    },
    managementApi: {
      users: {
        read: true,
        create: true,
        update: true,
        delete: true,
      },
      health: true,
    },
  };

  return await BetterAuthProvider.create(idpConfig);
}
