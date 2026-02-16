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
export { BetterAuthSessionService } from './services/auth/better-auth-session-service.js';
export { MiddlewareService } from './services/middleware/middleware-service.js';
export { RequestHandlerService } from './services/middleware/request-handler-service.js';
export { PageRenderService } from './services/rendering/page-service.js';
export { PasswordFlowController } from './services/rendering/password-flow-controller.js';
export { TemplateService } from './services/rendering/template-service.js';

// Types
export type { BetterAuthConfig, DatabaseConfig, MySqlConfig, SqliteConfig } from './types/index.js';
