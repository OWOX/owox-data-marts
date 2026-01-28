// Main Better Auth exports
export { createBetterAuthConfig } from './auth/auth-config.js';
export { OwoxBetterAuthProvider } from './providers/better-auth-provider.js';

// Services
export { AuthenticationService } from './services/authentication-service.js';
export { CryptoService } from './services/crypto-service.js';
export { MagicLinkService } from './services/magic-link-service.js';
export { MiddlewareService } from './services/middleware-service.js';
export { PageService } from './services/page-service.js';
export { RequestHandlerService } from './services/request-handler-service.js';
export { TemplateService } from './services/template-service.js';
export { TokenService } from './services/token-service.js';
export { UserManagementService } from './services/user-management-service.js';

// Types
export type {
  BetterAuthConfig,
  CustomDatabaseConfig,
  DatabaseConfig,
  MySqlConfig,
  SqliteConfig,
} from './types/index.js';
