import { Module, DynamicModule, Global } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { AuthGuard } from './auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { IIdpProvider } from '../types/interfaces.js';

export interface AuthModuleOptions {
  idpProvider: IIdpProvider;
  useGlobalGuards?: boolean;
}

@Global()
@Module({})
export class AuthModule {
  static forRoot(options: AuthModuleOptions): DynamicModule {
    const providers: any[] = [
      {
        provide: 'IDP_PROVIDER',
        useValue: options.idpProvider,
      },
      {
        provide: AuthGuard,
        useFactory: (idpProvider: IIdpProvider, reflector: any) =>
          new AuthGuard(idpProvider, reflector),
        inject: ['IDP_PROVIDER', Reflector],
      },
      RolesGuard,
    ];

    if (options.useGlobalGuards) {
      providers.push(
        {
          provide: APP_GUARD,
          useExisting: AuthGuard,
        },
        {
          provide: APP_GUARD,
          useClass: RolesGuard,
        }
      );
    }

    return {
      module: AuthModule,
      providers,
      exports: ['IDP_PROVIDER', AuthGuard, RolesGuard],
    };
  }
}
