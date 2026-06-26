import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Role as IdpRole } from '@owox/idp-protocol';
import {
  Auth,
  AuthContext,
  AuthorizationContext,
  RejectApiKeyAuth,
  Role,
  Strategy,
} from '../../idp';
import {
  CreateNewProjectResponseApiDto,
  RequestAccessContextApiDto,
  RequestProjectAccessApiDto,
  RequestProjectAccessResponseApiDto,
} from '../dto/presentation/request-access-api.dto';
import { CreateNewProjectService } from '../use-cases/project-members/create-new-project.service';
import { GetRequestAccessContextService } from '../use-cases/project-members/get-request-access-context.service';
import { RequestProjectAccessService } from '../use-cases/project-members/request-project-access.service';
import {
  CreateNewProjectSpec,
  GetRequestAccessContextSpec,
  RequestProjectAccessSpec,
} from './spec/request-access.api';

@Controller('user-provisioning')
@ApiTags('User Provisioning')
@RejectApiKeyAuth()
export class RequestAccessController {
  constructor(
    private readonly getRequestAccessContext: GetRequestAccessContextService,
    private readonly requestProjectAccess: RequestProjectAccessService,
    private readonly createNewProjectService: CreateNewProjectService
  ) {}

  @Auth(Role.authenticated(Strategy.PARSE))
  @Get('request-access-context')
  @GetRequestAccessContextSpec()
  async getContext(
    @AuthContext() context: AuthorizationContext
  ): Promise<RequestAccessContextApiDto> {
    const requestAccessContext = await this.getRequestAccessContext.run(
      context.userId,
      context.projectId
    );
    return {
      ...requestAccessContext,
      availableRoles: requestAccessContext.availableRoles,
      defaultRole: requestAccessContext.defaultRole,
      existingRequest: requestAccessContext.existingRequest ?? null,
    } as RequestAccessContextApiDto;
  }

  @Auth(Role.authenticated(Strategy.INTROSPECT))
  @Post('request-access')
  @HttpCode(202)
  @RequestProjectAccessSpec()
  async requestAccess(
    @AuthContext() context: AuthorizationContext,
    @Body() dto: RequestProjectAccessApiDto
  ): Promise<RequestProjectAccessResponseApiDto> {
    const result = await this.requestProjectAccess.run(
      context.userId,
      context.projectId,
      dto.role as IdpRole
    );
    return result as RequestProjectAccessResponseApiDto;
  }

  @Auth(Role.authenticated(Strategy.INTROSPECT))
  @Post('create-new-project')
  @CreateNewProjectSpec()
  async createNewProject(
    @AuthContext() context: AuthorizationContext
  ): Promise<CreateNewProjectResponseApiDto> {
    const result = await this.createNewProjectService.run(context.userId);
    return result as CreateNewProjectResponseApiDto;
  }
}
