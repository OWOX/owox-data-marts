import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { IdpAuthGuard, IdpRoleGuard } from './guards';
import { IdpExceptionFilter } from './filters/idp-exception.filter';

@Module({
  imports: [],
  controllers: [],
  providers: [
    IdpAuthGuard,
    IdpRoleGuard,
    {
      provide: APP_FILTER,
      useClass: IdpExceptionFilter,
    },
  ],
  exports: [IdpAuthGuard, IdpRoleGuard],
})
export class IdpModule {}
