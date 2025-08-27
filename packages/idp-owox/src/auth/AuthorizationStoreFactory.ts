import type { AuthorizationStore } from './AuthorizationStore';
import { MysqlAuthorizationStore } from './MysqlAuthorizationStore';
import { SqliteAuthorizationStore } from './SqliteAuthorizationStore';
import type { DbConfig } from '../config';

/**
 * Factory that creates AuthorizationStore implementation based on configuration.
 */
export function createAuthorizationStore(config: DbConfig): AuthorizationStore {
  const type = config.type;
  if (type === 'sqlite') {
    return new SqliteAuthorizationStore(config.sqlite);
  }
  if (type === 'mysql') {
    return new MysqlAuthorizationStore(config.mysql);
  }
  throw new Error(`Unknown store type: ${type}`);
}
