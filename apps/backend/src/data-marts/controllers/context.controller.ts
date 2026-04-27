import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, AuthorizationContext, Role, Strategy } from '../../idp';
import {
  ContextImpactResponseApiDto,
  ContextResponseApiDto,
  CreateContextRequestApiDto,
  UpdateContextMembersRequestApiDto,
  UpdateContextMembersResponseApiDto,
  UpdateContextRequestApiDto,
  UpdateEntityContextsRequestApiDto,
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
  UpdateDataMartContextsSpec,
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
    return this.contextMapper.toResponse(result);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  @ListContextsSpec()
  async list(@AuthContext() context: AuthorizationContext): Promise<ContextResponseApiDto[]> {
    const results = await this.contextService.list(context.projectId);
    return results.map(r => this.contextMapper.toResponse(r));
  }

  @Auth(Role.admin(Strategy.INTROSPECT))
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
    return this.contextMapper.toResponse(result);
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
      affectedMemberIds: impact.affectedMemberIds,
    };
  }

  @Auth(Role.admin(Strategy.INTROSPECT))
  @Delete(':id')
  @HttpCode(204)
  @DeleteContextSpec()
  async delete(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<void> {
    await this.contextService.delete(id, context.projectId);
  }

  @Auth(Role.editor(Strategy.INTROSPECT))
  @Put('data-marts/:id/contexts')
  @UpdateDataMartContextsSpec()
  async updateDataMartContexts(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string,
    @Body() dto: UpdateEntityContextsRequestApiDto
  ): Promise<void> {
    await this.contextAccessService.updateDataMartContexts(
      id,
      context.projectId,
      dto.contextIds,
      context.userId,
      context.roles ?? []
    );
  }

  @Auth(Role.admin(Strategy.INTROSPECT))
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
