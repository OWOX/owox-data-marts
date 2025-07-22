import { BetterAuthProvider } from '../providers/better-auth-provider.js';
import type { BetterAuthConfig } from '../types/index.js';
import type { IdpConfig } from '@owox/idp-protocol';

/**
 * Example configuration for MySQL database
 */
export function createMysqlConfig(): { idpConfig: IdpConfig; betterAuthConfig: BetterAuthConfig } {
  const idpConfig: IdpConfig = {
    magicLinkTTL: 3600, // 1 hour
    magicLinkBaseUrl: process.env.APP_URL || 'http://localhost:3000',
    defaultProjectId: 'default',
    requireEmailVerification: true,
  };

  const betterAuthConfig: BetterAuthConfig = {
    database: {
      type: 'mysql',
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_NAME || 'better_auth',
      port: parseInt(process.env.DB_PORT || '3306'),
    },
    secret: process.env.BETTER_AUTH_SECRET || 'your-secret-key-here',
    baseURL: process.env.APP_URL || 'http://localhost:3000',
    trustedOrigins: [
      process.env.APP_URL || 'http://localhost:3000',
      'http://localhost:3001', // Add other trusted origins
    ],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendEmailVerification: async (email: string, url: string, token: string) => {
        console.log(`Send email verification to ${email}: ${url}?token=${token}`);
        // Implement your email sending logic here (e.g., using nodemailer, SendGrid, etc.)
      },
    },
    magicLink: {
      enabled: true,
      sendMagicLink: async ({ email, url, token }) => {
        console.log(`Send magic link to ${email}: ${url}?token=${token}`);
        // Implement your magic link sending logic here
      },
    },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      },
      github: {
        clientId: process.env.GITHUB_CLIENT_ID || '',
        clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
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
export async function createMysqlProvider(): Promise<BetterAuthProvider> {
  const { idpConfig, betterAuthConfig } = createMysqlConfig();
  return await BetterAuthProvider.create(idpConfig, betterAuthConfig);
}
