import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { IdpGuard } from './guards';
import { IdpExceptionFilter } from './filters/idp-exception.filter';
import { IdpProviderService } from './services/idp-provider.service';

@Module({
  imports: [],
  controllers: [],
  providers: [
    IdpProviderService,
    IdpGuard,
    {
      provide: APP_FILTER,
      useClass: IdpExceptionFilter,
    },
  ],
  exports: [IdpProviderService, IdpGuard],
})
export class IdpModule {}
