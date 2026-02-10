/**
 * Re-exports configuration helpers and types.
 */
export { createBetterAuthConfig } from './idp-better-auth-config.js';
export {
  loadBetterAuthProviderConfigFromEnv,
  loadIdpOwoxConfigFromEnv,
  type BetterAuthProviderConfig,
  type DbConfig,
  type IdpOwoxConfig,
  type MysqlConfig,
  type SqliteConfig,
} from './idp-owox-config.js';
