/**
 * Public entry point for idp-owox-better-auth exports.
 */
// Main Auth exports
export { createBetterAuthConfig } from './config/idp-better-auth-config.js';
export {
  loadBetterAuthProviderConfigFromEnv,
  loadIdpOwoxConfigFromEnv,
  type BetterAuthProviderConfig,
} from './config/index.js';
export {
  OwoxBetterAuthIdp,
  OwoxBetterAuthIdp as OwoxBetterAuthProvider,
  OwoxBetterAuthIdp as OwoxIdp,
} from './owox-better-auth-idp.js';

// Services
export { PageController } from './controllers/page-controller.js';
export { PasswordFlowController } from './controllers/password-flow-controller.js';
export { BetterAuthSessionService } from './services/auth/better-auth-session-service.js';
export { AuthFlowMiddleware } from './services/middleware/auth-flow-middleware.js';
export { BetterAuthProxyHandler } from './services/middleware/better-auth-proxy-handler.js';
export { TemplateService } from './services/rendering/template-service.js';

// Types
export type { BetterAuthConfig, DatabaseConfig, MySqlConfig, SqliteConfig } from './types/index.js';
