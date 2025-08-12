import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { IdpAuthGuard, IdpRoleGuard } from './guards';
import { IdpExceptionFilter } from './filters/idp-exception.filter';
import { IdpProviderService } from './services/idp-provider.service';

@Module({
  imports: [],
  controllers: [],
  providers: [
    IdpProviderService,
    IdpAuthGuard,
    IdpRoleGuard,
    {
      provide: APP_FILTER,
      useClass: IdpExceptionFilter,
    },
  ],
  exports: [IdpProviderService, IdpAuthGuard, IdpRoleGuard],
})
export class IdpModule {}
