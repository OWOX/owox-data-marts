import {
  BetterAuthProvider,
  CustomDatabaseConfig,
  MySqlConfig,
  SqliteConfig,
} from '@owox/idp-better-auth';
import { loadIdpOwoxConfigFromEnv, OwoxIdp } from '@owox/idp-owox';
import {
  CustomDatabaseConfig as OwoxBetterAuthCustomDatabaseConfig,
  MySqlConfig as OwoxBetterAuthMySqlConfig,
  OwoxBetterAuthProvider,
  SqliteConfig as OwoxBetterAuthSqliteConfig,
} from '@owox/idp-owox-better-auth';
import { IdpConfig, IdpProvider, NullIdpProvider } from '@owox/idp-protocol';
import { parseMysqlSslEnv } from '@owox/internal-helpers';

import { BaseCommand } from '../commands/base.js';

export enum IdpProviderType {
  BetterAuth = 'better-auth',
  None = 'none',
  Owox = 'owox',
  OwoxBetterAuth = 'owox-better-auth',
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

      case IdpProviderType.Owox: {
        return this.createOwoxProvider(command);
      }

      case IdpProviderType.OwoxBetterAuth: {
        return this.createOwoxBetterAuthProvider(command);
      }

      default: {
        throw new Error(`Unknown IDP provider: ${provider}`);
      }
    }
  }

  /**
   * Build BetterAuth MySQL config using prioritized environment variables.
   * Priority: IDP_BETTER_AUTH_MYSQL_*, DB_*.
   */
  private static buildBetterAuthMySqlConfig(): MySqlConfig {
    const ssl = parseMysqlSslEnv(process.env.IDP_BETTER_AUTH_MYSQL_SSL || process.env.DB_MYSQL_SSL);

    const host = process.env.IDP_BETTER_AUTH_MYSQL_HOST || process.env.DB_HOST;
    const user = process.env.IDP_BETTER_AUTH_MYSQL_USER || process.env.DB_USERNAME;
    const password = process.env.IDP_BETTER_AUTH_MYSQL_PASSWORD || process.env.DB_PASSWORD;
    const databaseName = process.env.IDP_BETTER_AUTH_MYSQL_DATABASE || process.env.DB_DATABASE;
    const port = Number.parseInt(
      (process.env.IDP_BETTER_AUTH_MYSQL_PORT || process.env.DB_PORT) as string,
      10
    );

    return {
      database: databaseName as string,
      host: host as string,
      password: password as string,
      port,
      type: 'mysql',
      user: user as string,
      ...(ssl === undefined ? {} : { ssl }),
    } satisfies MySqlConfig as MySqlConfig;
  }

  private static async createBetterAuthProvider(command: BaseCommand): Promise<BetterAuthProvider> {
    if (!process.env.IDP_BETTER_AUTH_SECRET) {
      command.error('IDP_BETTER_AUTH_SECRET is not set');
    }

    // Database configuration
    const databaseType = (process.env.IDP_BETTER_AUTH_DATABASE_TYPE ||
      process.env.DB_TYPE ||
      'sqlite') as 'custom' | 'mysql' | 'sqlite';

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
        database = this.buildBetterAuthMySqlConfig();
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

    const publicOriginOrDefault = (() => {
      const po = process.env.PUBLIC_ORIGIN;
      if (po && po.trim() !== '') {
        return po;
      }

      return `http://localhost:${process.env.PORT}`;
    })();

    const baseURL = process.env.IDP_BETTER_AUTH_BASE_URL || publicOriginOrDefault;

    const trustedOrigins = (() => {
      const list = process.env.IDP_BETTER_AUTH_TRUSTED_ORIGINS;
      if (list && list.trim() !== '') {
        return list
          .split(',')
          .map(origin => origin.trim())
          .filter(Boolean);
      }

      const fallback = baseURL;
      return fallback && fallback.trim() !== '' ? [fallback] : undefined;
    })();

    return BetterAuthProvider.create({
      baseURL,
      database,
      magicLinkTtl: Number.parseInt(
        (process.env.IDP_BETTER_AUTH_MAGIC_LINK_TTL || '3600') as string,
        10
      ),
      primaryAdminEmail: process.env.IDP_BETTER_AUTH_PRIMARY_ADMIN_EMAIL,
      secret: process.env.IDP_BETTER_AUTH_SECRET,
      session: {
        maxAge: Number.parseInt(
          (process.env.IDP_BETTER_AUTH_SESSION_MAX_AGE || '604800') as string,
          10
        ),
      },
      trustedOrigins,
    });
  }

  /**
   * Create NULL IDP provider for single-user deployments
   */
  private static async createNullProvider(): Promise<NullIdpProvider> {
    return new NullIdpProvider();
  }

  // TODO: Add new ENV variables for Owox Better Auth?
  private static async createOwoxBetterAuthProvider(
    command: BaseCommand
  ): Promise<OwoxBetterAuthProvider> {
    if (!process.env.IDP_BETTER_AUTH_SECRET) {
      command.error('IDP_BETTER_AUTH_SECRET is not set');
    }

    const googleClientId = process.env.IDP_BETTER_AUTH_GOOGLE_CLIENT_ID;
    const googleClientSecret = process.env.IDP_BETTER_AUTH_GOOGLE_CLIENT_SECRET;
    const googleRedirectURI = process.env.IDP_BETTER_AUTH_GOOGLE_REDIRECT_URI;

    const microsoftClientId = process.env.IDP_BETTER_AUTH_MICROSOFT_CLIENT_ID;
    const microsoftClientSecret = process.env.IDP_BETTER_AUTH_MICROSOFT_CLIENT_SECRET;
    const microsoftRedirectURI = process.env.IDP_BETTER_AUTH_MICROSOFT_REDIRECT_URI;
    const microsoftTenantId = process.env.IDP_BETTER_AUTH_MICROSOFT_TENANT_ID;
    const microsoftAuthority = process.env.IDP_BETTER_AUTH_MICROSOFT_AUTHORITY;

    // Database configuration
    const databaseType = (process.env.IDP_BETTER_AUTH_DATABASE_TYPE ||
      process.env.DB_TYPE ||
      'sqlite') as 'custom' | 'mysql' | 'sqlite';

    let database:
      | OwoxBetterAuthCustomDatabaseConfig
      | OwoxBetterAuthMySqlConfig
      | OwoxBetterAuthSqliteConfig;
    switch (databaseType) {
      case 'custom': {
        database = {
          adapter: undefined,
          type: 'custom' as const,
        };
        break;
      }

      case 'mysql': {
        database = this.buildBetterAuthMySqlConfig();
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

    const publicOriginOrDefault = (() => {
      const po = process.env.PUBLIC_ORIGIN;
      if (po && po.trim() !== '') {
        return po;
      }

      return `http://localhost:${process.env.PORT}`;
    })();

    const baseURL = process.env.IDP_BETTER_AUTH_BASE_URL || publicOriginOrDefault;

    const trustedOrigins = (() => {
      const list = process.env.IDP_BETTER_AUTH_TRUSTED_ORIGINS;
      if (list && list.trim() !== '') {
        return list
          .split(',')
          .map(origin => origin.trim())
          .filter(Boolean);
      }

      const fallback = baseURL;
      return fallback && fallback.trim() !== '' ? [fallback] : undefined;
    })();

    const socialProviders = (() => {
      const providers: Record<string, unknown> = {};

      if (googleClientId && googleClientSecret) {
        providers.google = {
          clientId: googleClientId,
          clientSecret: googleClientSecret,
          redirectURI: googleRedirectURI,
        };
      }

      if (microsoftClientId && microsoftClientSecret) {
        providers.microsoft = {
          clientId: microsoftClientId,
          clientSecret: microsoftClientSecret,
          redirectURI: microsoftRedirectURI,
          ...(microsoftTenantId ? { tenantId: microsoftTenantId } : {}),
          ...(microsoftAuthority ? { authority: microsoftAuthority } : {}),
        };
      }

      return Object.keys(providers).length > 0 ? providers : undefined;
    })();

    return OwoxBetterAuthProvider.create({
      baseURL,
      database,
      magicLinkTtl: Number.parseInt(
        (process.env.IDP_BETTER_AUTH_MAGIC_LINK_TTL || '3600') as string,
        10
      ),
      secret: process.env.IDP_BETTER_AUTH_SECRET,
      session: {
        maxAge: Number.parseInt(
          (process.env.IDP_BETTER_AUTH_SESSION_MAX_AGE || '604800') as string,
          10
        ),
      },
      ...(socialProviders ? { socialProviders } : {}),
      trustedOrigins,
    });
  }

  /**
   * Creates and initializes an instance of OwoxIdp provider using the configuration
   * loaded from the environment. Handles errors by displaying an appropriate error message
   * and exiting the command execution.
   *
   * @param {BaseCommand} command - The command instance that provides context and error handling capabilities.
   * @returns {Promise<OwoxIdp>} A promise that resolves to an OwoxIdp instance initialized with the loaded configuration.
   */
  private static async createOwoxProvider(command: BaseCommand): Promise<OwoxIdp> {
    try {
      const idpOwoxConfig = loadIdpOwoxConfigFromEnv();
      return new OwoxIdp(idpOwoxConfig);
    } catch (error: unknown) {
      if (error instanceof Error) {
        command.error(error, { exit: 1 });
      }

      command.error(new Error(String(error)), { exit: 1 });
    }
  }
}
