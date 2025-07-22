// Main exports
export { BetterAuthProvider } from './providers/better-auth-provider.js';
export { createBetterAuthConfig } from './config/better-auth.config.js';

// Types
export type { BetterAuthConfig } from './types/index.js';

// Express utilities
export {
  createBetterAuthMiddleware,
  createAuthenticationMiddleware,
  requireEmailVerification,
  extractUserFromSession,
} from './utils/express-middleware.js';

// NestJS utilities
export {
  BetterAuthService,
  BetterAuthModule,
  type BetterAuthModuleOptions,
} from './utils/nestjs-adapter.js';
