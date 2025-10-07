import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { IdpGuard } from './guards';
import { IdpExceptionFilter } from './filters/idp-exception.filter';
import { IdpProviderService } from './services/idp-provider.service';
import { IntercomController } from './controllers/intercom.controller';
import { IssueIntercomJwtService } from './use-cases/issue-intercom-jwt.service';
import { IntercomMapper } from './mappers/intercom.mapper';

@Module({
  imports: [],
  controllers: [IntercomController],
  providers: [
    IdpProviderService,
    IdpGuard,
    IssueIntercomJwtService,
    IntercomMapper,
    {
      provide: APP_FILTER,
      useClass: IdpExceptionFilter,
    },
  ],
  exports: [IdpProviderService, IdpGuard],
})
export class IdpModule {}
