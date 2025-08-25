import { BetterAuthProvider } from '@owox/idp-better-auth';
import { IdpConfig, IdpProvider, NullIdpProvider } from '@owox/idp-protocol';

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
  static async createFromEnvironment(): Promise<IdpProvider> {
    const providerType = (process.env.IDP_PROVIDER || IdpProviderType.None) as IdpProviderType;
    return this.createProvider({
      provider: providerType,
    });
  }

  /**
   * Create an IDP provider instance based on the provider type
   */
  static async createProvider(options: IdpFactoryOptions): Promise<IdpProvider> {
    const { provider } = options;

    switch (provider) {
      case IdpProviderType.BetterAuth: {
        return this.createBetterAuthProvider();
      }

      case IdpProviderType.None: {
        return this.createNullProvider();
      }

      default: {
        throw new Error(`Unknown IDP provider: ${provider}`);
      }
    }
  }

  private static async createBetterAuthProvider(): Promise<BetterAuthProvider> {
    console.log('creating better auth provider');
    return BetterAuthProvider.create({
      database: {
        filename: 'better-auth.db',
        type: 'sqlite',
      },
      secret: 'secret',
    });
  }

  /**
   * Create NULL IDP provider for single-user deployments
   */
  private static async createNullProvider(): Promise<NullIdpProvider> {
    return new NullIdpProvider();
  }
}
