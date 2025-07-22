import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import { BetterAuthConfig } from '../types/index.js';
import { createDatabaseAdapter } from '../adapters/database.js';

export async function createBetterAuthConfig(
  config: BetterAuthConfig
): Promise<ReturnType<typeof betterAuth>> {
  // Create database adapter based on configuration
  const database = await createDatabaseAdapter(config.database);

  const plugins: any[] = [];

  // Add magic link plugin if enabled
  if (config.magicLink?.enabled) {
    plugins.push(
      magicLink({
        sendMagicLink: config.magicLink.sendMagicLink,
        expiresIn: config.magicLink.expiresIn || 300, // 5 minutes default
        disableSignUp: config.magicLink.disableSignUp || false,
      })
    );
  }

  const authConfig: any = {
    database,
    plugins,
    session: {
      expiresIn: config.session?.maxAge || 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // 1 day
    },
    trustedOrigins: config.trustedOrigins || ['http://localhost:3000'],
    baseURL: config.baseURL || 'http://localhost:3000',
    secret: config.secret,
  };

  // Add email and password authentication if enabled
  if (config.emailAndPassword?.enabled) {
    authConfig.emailAndPassword = {
      enabled: true,
      requireEmailVerification: config.emailAndPassword.requireEmailVerification || false,
    };

    if (config.emailAndPassword.sendEmailVerification) {
      authConfig.emailAndPassword.sendEmailVerification =
        config.emailAndPassword.sendEmailVerification;
    }
  }

  // Add social providers if configured
  if (config.socialProviders) {
    authConfig.socialProviders = {};

    if (config.socialProviders.google) {
      authConfig.socialProviders.google = {
        clientId: config.socialProviders.google.clientId,
        clientSecret: config.socialProviders.google.clientSecret,
      };
    }

    if (config.socialProviders.github) {
      authConfig.socialProviders.github = {
        clientId: config.socialProviders.github.clientId,
        clientSecret: config.socialProviders.github.clientSecret,
      };
    }
  }

  return betterAuth(authConfig);
}
