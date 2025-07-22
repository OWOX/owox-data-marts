// Main Better Auth exports
export { BetterAuthProvider } from './providers/better-auth-provider.js';
export { createBetterAuthConfig } from './config/better-auth.config.js';

// Database adapters
export {
  createDatabaseAdapter,
  createSqliteAdapter,
  createMysqlAdapter,
} from './adapters/database.js';

// Example configurations
export * from './examples/index.js';

// Types
export type {
  BetterAuthConfig,
  DatabaseConfig,
  SqliteConfig,
  MySqlConfig,
  CustomDatabaseConfig,
} from './types/index.js';
