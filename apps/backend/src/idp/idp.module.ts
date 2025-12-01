import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectProjection } from './entities/project-projection.entity';
import { UserProjection } from './entities/user-projection.entity';
import { IdpProjectionsFacade } from './facades/idp-projections.facade';
import { IdpGuard } from './guards';
import { IdpExceptionFilter } from './filters/idp-exception.filter';
import { ProjectionsMapper } from './mappers/projections.mapper';
import { IdpProjectionsService } from './services/idp-projections.service';
import { IdpProviderService } from './services/idp-provider.service';
import { IntercomController } from './controllers/intercom.controller';
import { IssueIntercomJwtService } from './use-cases/issue-intercom-jwt.service';
import { IntercomMapper } from './mappers/intercom.mapper';

@Module({
  imports: [TypeOrmModule.forFeature([UserProjection, ProjectProjection])],
  controllers: [IntercomController],
  providers: [
    IdpProviderService,
    IdpProjectionsService,
    IdpGuard,
    IssueIntercomJwtService,
    IntercomMapper,
    {
      provide: APP_FILTER,
      useClass: IdpExceptionFilter,
    },
    ProjectionsMapper,
    IdpProjectionsFacade,
  ],
  exports: [IdpProviderService, IdpProjectionsService, IdpGuard, IdpProjectionsFacade],
})
export class IdpModule {}
