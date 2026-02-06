// Main Auth exports
export { createBetterAuthConfig } from './config/idp-better-auth-config.js';
export {
  loadBetterAuthProviderConfigFromEnv,
  loadIdpOwoxConfigFromEnv,
  type BetterAuthProviderConfig
} from './config/index.js';
export { OwoxBetterAuthIdp, OwoxBetterAuthIdp as OwoxBetterAuthProvider, OwoxBetterAuthIdp as OwoxIdp } from './owoxBetterAuthIdp.js';

// Services
export { AuthenticationService } from './services/authentication-service.js';
export { CryptoService } from './services/crypto-service.js';
export { MagicLinkService } from './services/magic-link-service.js';
export { MiddlewareService } from './services/middleware-service.js';
export { PageService } from './services/page-service.js';
export { RequestHandlerService } from './services/request-handler-service.js';
export { TemplateService } from './services/template-service.js';
export { UserManagementService } from './services/user-management-service.js';

// Types
export type {
  BetterAuthConfig,
  DatabaseConfig,
  MySqlConfig,
  SqliteConfig
} from './types/index.js';

