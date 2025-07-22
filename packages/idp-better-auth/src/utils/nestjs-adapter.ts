import { Injectable, Module, type DynamicModule } from '@nestjs/common';
import { BetterAuthProvider } from '../providers/better-auth-provider.js';
import type { BetterAuthConfig } from '../types/index.js';
import type { IdpConfig } from '@owox/idp-protocol';

@Injectable()
export class BetterAuthService extends BetterAuthProvider {
  constructor(idpConfig: IdpConfig, betterAuthConfig: BetterAuthConfig) {
    super(idpConfig, betterAuthConfig);
  }
}

export interface BetterAuthModuleOptions {
  idpConfig: IdpConfig;
  betterAuthConfig: BetterAuthConfig;
}

@Module({})
export class BetterAuthModule {
  static forRoot(options: BetterAuthModuleOptions): DynamicModule {
    return {
      module: BetterAuthModule,
      providers: [
        {
          provide: 'BETTER_AUTH_CONFIG',
          useValue: options,
        },
        {
          provide: BetterAuthService,
          useFactory: (config: BetterAuthModuleOptions) =>
            new BetterAuthService(config.idpConfig, config.betterAuthConfig),
          inject: ['BETTER_AUTH_CONFIG'],
        },
      ],
      exports: [BetterAuthService],
      global: true,
    };
  }
}
