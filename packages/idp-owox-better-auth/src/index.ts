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
export { AuthenticationService } from './services/authentication-service.js';
export { MiddlewareService } from './services/middleware-service.js';
export { PageService } from './services/page-service.js';
export { RequestHandlerService } from './services/request-handler-service.js';
export { TemplateService } from './services/template-service.js';

// Types
export type { BetterAuthConfig, DatabaseConfig, MySqlConfig, SqliteConfig } from './types/index.js';
