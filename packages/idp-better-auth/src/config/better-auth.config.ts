import { betterAuth } from 'better-auth';
import { BetterAuthConfig } from '../types/index.js';

export function createBetterAuthConfig(config: BetterAuthConfig): ReturnType<typeof betterAuth> {
  const authConfig: any = {
    database: config.database,
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

  // Add magic link authentication if enabled
  if (config.magicLink?.enabled) {
    authConfig.magicLink = {
      enabled: true,
    };

    if (config.magicLink.sendMagicLink) {
      authConfig.magicLink.sendMagicLink = config.magicLink.sendMagicLink;
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
