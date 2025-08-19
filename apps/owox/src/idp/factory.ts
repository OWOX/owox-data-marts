import { IdpConfig, IdpProvider, NullIdpProvider } from '@owox/idp-protocol';

export enum IdpProviderType {
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
      case IdpProviderType.None: {
        return this.createNullProvider();
      }

      default: {
        throw new Error(`Unknown IDP provider: ${provider}`);
      }
    }
  }

  /**
   * Validate provider configuration without creating the provider
   */
  static validateConfiguration(options: IdpFactoryOptions): { errors: string[]; isValid: boolean } {
    const errors: string[] = [];
    const { provider } = options;

    if (![IdpProviderType.None].includes(provider)) {
      errors.push(`Invalid provider type: ${provider}`);
      return { errors, isValid: false };
    }

    return {
      errors,
      isValid: errors.length === 0,
    };
  }

  /**
   * Create NULL IDP provider for single-user deployments
   */
  private static createNullProvider(): NullIdpProvider {
    return new NullIdpProvider();
  }
}
