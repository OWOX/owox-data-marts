// Main Better Auth exports
export { BetterAuthProvider } from './providers/better-auth-provider.js';
export { createBetterAuthConfig } from './auth/auth-config.js';

// Services
export { TemplateService } from './services/template-service.js';
export { MagicLinkService } from './services/magic-link-service.js';
export { PageService } from './services/page-service.js';
export { AuthenticationService } from './services/authentication-service.js';
export { TokenService } from './services/token-service.js';
export { UserManagementService } from './services/user-management-service.js';
export { RequestHandlerService } from './services/request-handler-service.js';
export { MiddlewareService } from './services/middleware-service.js';
export { CryptoService } from './services/crypto-service.js';

// Types
export type {
  BetterAuthConfig,
  DatabaseConfig,
  SqliteConfig,
  MySqlConfig,
  CustomDatabaseConfig,
} from './types/index.js';
