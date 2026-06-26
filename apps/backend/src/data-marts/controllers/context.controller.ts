import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  Auth,
  AuthContext,
  AuthorizationContext,
  RejectApiKeyAuth,
  Role,
  Strategy,
} from '../../idp';
import {
  ContextImpactResponseApiDto,
  ContextResponseApiDto,
  CreateContextRequestApiDto,
  UpdateContextMembersRequestApiDto,
  UpdateContextMembersResponseApiDto,
  UpdateContextRequestApiDto,
} from '../dto/presentation/context-api.dto';
import { ContextMapper } from '../mappers/context.mapper';
import { ContextAccessService } from '../services/context/context-access.service';
import { ContextService } from '../services/context/context.service';
import { SetContextMembersService } from '../use-cases/contexts/set-context-members.service';
import {
  CreateContextSpec,
  DeleteContextSpec,
  GetContextImpactSpec,
  ListContextsSpec,
  SetContextMembersSpec,
  UpdateContextSpec,
} from './spec/context.api';

@Controller('contexts')
@ApiTags('Contexts')
export class ContextController {
  constructor(
    private readonly contextService: ContextService,
    private readonly contextAccessService: ContextAccessService,
    private readonly contextMapper: ContextMapper,
    private readonly setContextMembersService: SetContextMembersService
  ) {}

  @Auth(Role.admin(Strategy.INTROSPECT))
  @RejectApiKeyAuth()
  @Post()
  @CreateContextSpec()
  async create(
    @AuthContext() context: AuthorizationContext,
    @Body() dto: CreateContextRequestApiDto
  ): Promise<ContextResponseApiDto> {
    const result = await this.contextService.create(
      context.projectId,
      context.userId,
      dto.name,
      dto.description
    );
    return this.contextMapper.toApiResponse(result);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  @ListContextsSpec()
  async list(@AuthContext() context: AuthorizationContext): Promise<ContextResponseApiDto[]> {
    const results = await this.contextService.list(context.projectId);
    return results.map(r => this.contextMapper.toApiResponse(r));
  }

  @Auth(Role.admin(Strategy.INTROSPECT))
  @RejectApiKeyAuth()
  @Put(':id')
  @UpdateContextSpec()
  async update(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string,
    @Body() dto: UpdateContextRequestApiDto
  ): Promise<ContextResponseApiDto> {
    const result = await this.contextService.update(
      id,
      context.projectId,
      dto.name,
      dto.description
    );
    return this.contextMapper.toApiResponse(result);
  }

  @Auth(Role.admin(Strategy.INTROSPECT))
  @Get(':id/impact')
  @GetContextImpactSpec()
  async getImpact(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<ContextImpactResponseApiDto> {
    const impact = await this.contextService.getImpact(id, context.projectId);
    return {
      contextId: impact.contextId,
      contextName: impact.contextName,
      dataMartCount: impact.dataMartCount,
      storageCount: impact.storageCount,
      destinationCount: impact.destinationCount,
      memberCount: impact.memberCount,
      userProvisioningDefaultsCount: impact.userProvisioningDefaultsCount,
      affectedMemberIds: impact.affectedMemberIds,
    };
  }

  @Auth(Role.admin(Strategy.INTROSPECT))
  @RejectApiKeyAuth()
  @Delete(':id')
  @HttpCode(204)
  @DeleteContextSpec()
  async delete(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<void> {
    await this.contextService.delete(id, context.projectId);
  }

  @Auth(Role.admin(Strategy.INTROSPECT))
  @RejectApiKeyAuth()
  @Put(':id/members')
  @SetContextMembersSpec()
  async setContextMembers(
    @AuthContext() context: AuthorizationContext,
    @Param('id') contextId: string,
    @Body() dto: UpdateContextMembersRequestApiDto
  ): Promise<UpdateContextMembersResponseApiDto> {
    return this.setContextMembersService.run(contextId, context.projectId, dto.assignedUserIds);
  }
}
