import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectProjection } from './entities/project-projection.entity';
import { UserProjection } from './entities/user-projection.entity';
import { IdpProjectionsFacade } from './facades/idp-projections.facade';
import { MCP_PROJECT_CONTEXT_FACADE } from './facades/mcp-project-context.facade';
import { McpProjectContextFacadeImpl } from './facades/mcp-project-context.facade.impl';
import { IdpGuard } from './guards';
import { IdpExceptionFilter } from './filters/idp-exception.filter';
import { ProjectionsMapper } from './mappers/projections.mapper';
import { IdpProjectionsService } from './services/idp-projections.service';
import { IdpProviderService } from './services/idp-provider.service';
import { TenantGuardService } from './services/tenant-guard.service';
import { IntercomController } from './controllers/intercom.controller';
import { AuthContextController } from './controllers/auth-context.controller';
import { IssueIntercomJwtService } from './use-cases/issue-intercom-jwt.service';
import { IntercomMapper } from './mappers/intercom.mapper';
import { OAuthModule } from './oauth/oauth.module';

@Module({
  imports: [TypeOrmModule.forFeature([UserProjection, ProjectProjection]), OAuthModule],
  controllers: [IntercomController, AuthContextController],
  providers: [
    IdpProviderService,
    IdpProjectionsService,
    IdpGuard,
    IssueIntercomJwtService,
    IntercomMapper,
    TenantGuardService,
    {
      provide: APP_FILTER,
      useClass: IdpExceptionFilter,
    },
    ProjectionsMapper,
    IdpProjectionsFacade,
    {
      provide: MCP_PROJECT_CONTEXT_FACADE,
      useClass: McpProjectContextFacadeImpl,
    },
  ],
  exports: [
    IdpProviderService,
    IdpProjectionsService,
    IdpGuard,
    IdpProjectionsFacade,
    MCP_PROJECT_CONTEXT_FACADE,
    TenantGuardService,
    OAuthModule,
  ],
})
export class IdpModule {}
