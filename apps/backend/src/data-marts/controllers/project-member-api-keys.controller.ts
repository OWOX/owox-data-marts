import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, AuthContext, RejectApiKeyAuth } from '../../idp/decorators';
import { AuthorizationContext, Role, Strategy } from '../../idp/types';
import {
  CreateProjectMemberApiKeyRequestDto,
  CreateProjectMemberApiKeyResponseDto,
  ProjectMemberApiKeyResponseDto,
  UpdateProjectMemberApiKeyRequestDto,
} from '../dto/presentation/project-member-api-key-api.dto';
import { ListProjectMemberApiKeysService } from '../use-cases/project-member-api-keys/list-project-member-api-keys.service';
import { CreateProjectMemberApiKeyService } from '../use-cases/project-member-api-keys/create-project-member-api-key.service';
import { UpdateProjectMemberApiKeyService } from '../use-cases/project-member-api-keys/update-project-member-api-key.service';
import { RevokeProjectMemberApiKeyService } from '../use-cases/project-member-api-keys/revoke-project-member-api-key.service';
import { ProjectMemberApiKeysMapper } from '../mappers/project-member-api-keys.mapper';
import {
  ListProjectMemberApiKeysSpec,
  CreateProjectMemberApiKeySpec,
  UpdateProjectMemberApiKeySpec,
  RevokeProjectMemberApiKeySpec,
} from './spec/project-member-api-keys.api';

@Controller('project-member-api-keys')
@ApiTags('Project Member API Keys')
@RejectApiKeyAuth()
export class ProjectMemberApiKeysController {
  constructor(
    private readonly listKeys: ListProjectMemberApiKeysService,
    private readonly createKey: CreateProjectMemberApiKeyService,
    private readonly updateKey: UpdateProjectMemberApiKeyService,
    private readonly revokeKey: RevokeProjectMemberApiKeyService,
    private readonly mapper: ProjectMemberApiKeysMapper
  ) {}

  @Auth(Role.viewer(Strategy.PARSE))
  @ListProjectMemberApiKeysSpec()
  @Get()
  async list(
    @AuthContext() context: AuthorizationContext,
    @Query('includeRevoked') includeRevoked?: string
  ): Promise<ProjectMemberApiKeyResponseDto[]> {
    const command = this.mapper.toListCommand(context, includeRevoked === 'true');
    const keys = await this.listKeys.run(command);
    return keys.map(k => this.mapper.toApiResponse(k));
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @CreateProjectMemberApiKeySpec()
  @Post()
  @HttpCode(201)
  async create(
    @AuthContext() context: AuthorizationContext,
    @Body() dto: CreateProjectMemberApiKeyRequestDto
  ): Promise<CreateProjectMemberApiKeyResponseDto> {
    const command = this.mapper.toCreateCommand(context, dto);
    const result = await this.createKey.run(command);
    return this.mapper.toCreateApiResponse(result);
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @UpdateProjectMemberApiKeySpec()
  @Patch(':apiKeyId')
  async update(
    @AuthContext() context: AuthorizationContext,
    @Param('apiKeyId') apiKeyId: string,
    @Body() dto: UpdateProjectMemberApiKeyRequestDto
  ): Promise<ProjectMemberApiKeyResponseDto> {
    const command = this.mapper.toUpdateCommand(context, apiKeyId, dto);
    const updated = await this.updateKey.run(command);
    return this.mapper.toApiResponse(updated);
  }

  @Auth(Role.viewer(Strategy.INTROSPECT))
  @RevokeProjectMemberApiKeySpec()
  @Delete(':apiKeyId')
  @HttpCode(204)
  async revoke(
    @AuthContext() context: AuthorizationContext,
    @Param('apiKeyId') apiKeyId: string
  ): Promise<void> {
    const command = this.mapper.toRevokeCommand(context, apiKeyId);
    return this.revokeKey.run(command);
  }
}
