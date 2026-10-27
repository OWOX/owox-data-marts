import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, AuthorizationContext, Role, Strategy } from '../../idp';
import {
  ContextImpactResponseApiDto,
  ContextResponseApiDto,
  CreateContextRequestApiDto,
  UpdateContextIconApiDto,
  UpdateContextMembersRequestApiDto,
  UpdateContextMembersResponseApiDto,
  UpdateContextRequestApiDto,
} from '../dto/presentation/context-api.dto';
import { ContextMapper } from '../mappers/context.mapper';
import { CreateContextService } from '../use-cases/contexts/create-context.service';
import { UpdateContextMetadataService } from '../use-cases/contexts/update-context-metadata.service';
import { GetContextImpactService } from '../use-cases/contexts/get-context-impact.service';
import { DeleteContextService } from '../use-cases/contexts/delete-context.service';
import { ListContextsService } from '../use-cases/contexts/list-contexts.service';
import { SetContextMembersService } from '../use-cases/contexts/set-context-members.service';
import {
  CreateContextSpec,
  DeleteContextSpec,
  GetContextImpactSpec,
  ListContextsSpec,
  SetContextMembersSpec,
  UpdateContextIconSpec,
  UpdateContextSpec,
} from './spec/context.api';

@Controller('contexts')
@ApiTags('Contexts')
export class ContextController {
  constructor(
    private readonly createContextService: CreateContextService,
    private readonly updateContextMetadataService: UpdateContextMetadataService,
    private readonly getContextImpactService: GetContextImpactService,
    private readonly deleteContextService: DeleteContextService,
    private readonly listContextsService: ListContextsService,
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
    const result = await this.createContextService.run(
      this.contextMapper.toCreateCommand(context, dto)
    );
    return this.contextMapper.toApiResponse(result);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @Get()
  @ListContextsSpec()
  async list(@AuthContext() context: AuthorizationContext): Promise<ContextResponseApiDto[]> {
    const results = await this.listContextsService.run(this.contextMapper.toListCommand(context));
    return results.map(r => this.contextMapper.toApiResponse(r));
  }

  @Auth(Role.admin(Strategy.INTROSPECT))
  @Put(':id')
  @UpdateContextSpec()
  async update(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string,
    @Body() dto: UpdateContextRequestApiDto
  ): Promise<ContextResponseApiDto> {
    const result = await this.updateContextMetadataService.run(
      this.contextMapper.toUpdateMetadataCommand(context, id, dto)
    );
    return this.contextMapper.toApiResponse(result);
  }

  @Auth(Role.admin(Strategy.INTROSPECT))
  @Put(':id/icon')
  @UpdateContextIconSpec()
  async updateIcon(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string,
    @Body() dto: UpdateContextIconApiDto
  ): Promise<ContextResponseApiDto> {
    const result = await this.updateContextMetadataService.run(
      this.contextMapper.toUpdateIconCommand(context, id, dto)
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
    const impact = await this.getContextImpactService.run(
      this.contextMapper.toGetImpactCommand(context, id)
    );
    return this.contextMapper.toImpactResponse(impact);
  }

  @Auth(Role.admin(Strategy.INTROSPECT))
  @Delete(':id')
  @HttpCode(204)
  @DeleteContextSpec()
  async delete(
    @AuthContext() context: AuthorizationContext,
    @Param('id') id: string
  ): Promise<void> {
    await this.deleteContextService.run(this.contextMapper.toDeleteCommand(context, id));
  }

  @Auth(Role.admin(Strategy.INTROSPECT))
  @Put(':id/members')
  @SetContextMembersSpec()
  async setContextMembers(
    @AuthContext() context: AuthorizationContext,
    @Param('id') contextId: string,
    @Body() dto: UpdateContextMembersRequestApiDto
  ): Promise<UpdateContextMembersResponseApiDto> {
    return this.setContextMembersService.run(
      this.contextMapper.toSetMembersCommand(context, contextId, dto)
    );
  }
}
