import {
  BetterAuthProvider,
  CustomDatabaseConfig,
  MySqlConfig,
  SqliteConfig,
} from '@owox/idp-better-auth';
import { IdpConfig, IdpProvider, NullIdpProvider } from '@owox/idp-protocol';

import { BaseCommand } from '../commands/base.js';

export enum IdpProviderType {
  BetterAuth = 'better-auth',
  None = 'none',
}

export interface IdpFactoryOptions {
  config?: Partial<IdpConfig>;
  provider: IdpProviderType;
}

/**
 * Factory for creating IDP providers based on configuration
 */
export class IdpFactory {
  static async createFromEnvironment(command: BaseCommand): Promise<IdpProvider> {
    const providerType = (process.env.IDP_PROVIDER || IdpProviderType.None) as IdpProviderType;
    return this.createProvider(
      {
        provider: providerType,
      },
      command
    );
  }

  /**
   * Create an IDP provider instance based on the provider type
   */
  static async createProvider(
    options: IdpFactoryOptions,
    command: BaseCommand
  ): Promise<IdpProvider> {
    const { provider } = options;

    switch (provider) {
      case IdpProviderType.BetterAuth: {
        return this.createBetterAuthProvider(command);
      }

      case IdpProviderType.None: {
        return this.createNullProvider();
      }

      default: {
        throw new Error(`Unknown IDP provider: ${provider}`);
      }
    }
  }

  private static async createBetterAuthProvider(command: BaseCommand): Promise<BetterAuthProvider> {
    if (!process.env.IDP_BETTER_AUTH_SECRET) {
      command.error('IDP_BETTER_AUTH_SECRET is not set');
    }

    // Database configuration
    const databaseType = (process.env.IDP_BETTER_AUTH_DATABASE_TYPE || 'sqlite') as
      | 'custom'
      | 'mysql'
      | 'sqlite';

    let database: CustomDatabaseConfig | MySqlConfig | SqliteConfig;
    switch (databaseType) {
      case 'custom': {
        database = {
          adapter: undefined,
          type: 'custom' as const,
        };
        break;
      }

      case 'mysql': {
        database = {
          database: process.env.IDP_BETTER_AUTH_MYSQL_DATABASE || 'better_auth',
          host: process.env.IDP_BETTER_AUTH_MYSQL_HOST || 'localhost',
          password: process.env.IDP_BETTER_AUTH_MYSQL_PASSWORD || '',
          port: process.env.IDP_BETTER_AUTH_MYSQL_PORT
            ? Number.parseInt(process.env.IDP_BETTER_AUTH_MYSQL_PORT, 10)
            : 3306,
          type: 'mysql' as const,
          user: process.env.IDP_BETTER_AUTH_MYSQL_USER || 'root',
        };
        break;
      }

      case 'sqlite': {
        database = {
          filename: process.env.IDP_BETTER_AUTH_SQLITE_DB_PATH,
          type: 'sqlite' as const,
        };
        break;
      }

      default: {
        command.error(`Unsupported database type: ${databaseType}`);
      }
    }

    return BetterAuthProvider.create({
      baseURL: process.env.IDP_BETTER_AUTH_BASE_URL,
      database,
      magicLinkTll: process.env.IDP_BETTER_AUTH_MAGIC_LINK_TTL
        ? Number.parseInt(process.env.IDP_BETTER_AUTH_MAGIC_LINK_TTL, 10)
        : 3600,
      secret: process.env.IDP_BETTER_AUTH_SECRET,
      session: {
        maxAge: process.env.IDP_BETTER_AUTH_SESSION_MAX_AGE
          ? Number.parseInt(process.env.IDP_BETTER_AUTH_SESSION_MAX_AGE, 10)
          : 604_800,
      },
      trustedOrigins: process.env.IDP_BETTER_AUTH_TRUSTED_ORIGINS?.split(',').map(origin =>
        origin.trim()
      ),
    });
  }

  /**
   * Create NULL IDP provider for single-user deployments
   */
  private static async createNullProvider(): Promise<NullIdpProvider> {
    return new NullIdpProvider();
  }
}
