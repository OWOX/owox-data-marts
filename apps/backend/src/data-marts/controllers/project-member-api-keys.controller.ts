import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Role as IdpRole } from '@owox/idp-protocol';
import { Auth, AuthContext, AuthorizationContext, Role, Strategy } from '../../idp';
import {
  CreateProjectMemberApiKeyRequestDto,
  CreateProjectMemberApiKeyResponseDto,
  ProjectMemberApiKeyResponseDto,
  UpdateProjectMemberApiKeyRequestDto,
} from '../dto/presentation/project-member-api-key-api.dto';
import { ListProjectMemberApiKeysCommand } from '../dto/domain/list-project-member-api-keys.command';
import { CreateProjectMemberApiKeyCommand } from '../dto/domain/create-project-member-api-key.command';
import { UpdateProjectMemberApiKeyCommand } from '../dto/domain/update-project-member-api-key.command';
import { RevokeProjectMemberApiKeyCommand } from '../dto/domain/revoke-project-member-api-key.command';
import { ListProjectMemberApiKeysService } from '../use-cases/project-member-api-keys/list-project-member-api-keys.service';
import { CreateProjectMemberApiKeyService } from '../use-cases/project-member-api-keys/create-project-member-api-key.service';
import { UpdateProjectMemberApiKeyService } from '../use-cases/project-member-api-keys/update-project-member-api-key.service';
import { RevokeProjectMemberApiKeyService } from '../use-cases/project-member-api-keys/revoke-project-member-api-key.service';
import {
  ListProjectMemberApiKeysSpec,
  CreateProjectMemberApiKeySpec,
  UpdateProjectMemberApiKeySpec,
  RevokeProjectMemberApiKeySpec,
} from './spec/project-member-api-keys.api';

const ROLE_PRIORITY: Record<string, number> = { admin: 2, editor: 1, viewer: 0 };

function getHighestRole(roles?: IdpRole[]): IdpRole {
  if (!roles?.length) return 'viewer';
  return roles.reduce((highest, role) =>
    (ROLE_PRIORITY[role] ?? 0) > (ROLE_PRIORITY[highest] ?? 0) ? role : highest
  );
}

@Controller('project-member-api-keys')
@ApiTags('Project Member API Keys')
export class ProjectMemberApiKeysController {
  constructor(
    private readonly listKeys: ListProjectMemberApiKeysService,
    private readonly createKey: CreateProjectMemberApiKeyService,
    private readonly updateKey: UpdateProjectMemberApiKeyService,
    private readonly revokeKey: RevokeProjectMemberApiKeyService
  ) {}

  @Auth(Role.viewer(Strategy.PARSE))
  @ListProjectMemberApiKeysSpec()
  @Get()
  async list(
    @AuthContext() context: AuthorizationContext,
    @Query('includeRevoked') includeRevoked?: string
  ): Promise<ProjectMemberApiKeyResponseDto[]> {
    const command = new ListProjectMemberApiKeysCommand(
      context.projectId,
      context.userId,
      includeRevoked === 'true'
    );
    return this.listKeys.run(command);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @CreateProjectMemberApiKeySpec()
  @Post()
  @HttpCode(201)
  async create(
    @AuthContext() context: AuthorizationContext,
    @Body() dto: CreateProjectMemberApiKeyRequestDto
  ): Promise<CreateProjectMemberApiKeyResponseDto> {
    const role = getHighestRole(context.roles);
    const command = new CreateProjectMemberApiKeyCommand(
      context.projectId,
      context.userId,
      dto.name,
      role,
      dto.expiresAt
    );
    return this.createKey.run(command);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @UpdateProjectMemberApiKeySpec()
  @Patch(':apiKeyId')
  async update(
    @AuthContext() context: AuthorizationContext,
    @Param('apiKeyId') apiKeyId: string,
    @Body() dto: UpdateProjectMemberApiKeyRequestDto
  ): Promise<ProjectMemberApiKeyResponseDto> {
    const command = new UpdateProjectMemberApiKeyCommand(
      context.projectId,
      context.userId,
      apiKeyId,
      dto.name
    );
    return this.updateKey.run(command);
  }

  @Auth(Role.viewer(Strategy.PARSE))
  @RevokeProjectMemberApiKeySpec()
  @Delete(':apiKeyId')
  @HttpCode(204)
  async revoke(
    @AuthContext() context: AuthorizationContext,
    @Param('apiKeyId') apiKeyId: string
  ): Promise<void> {
    const command = new RevokeProjectMemberApiKeyCommand(
      context.projectId,
      context.userId,
      apiKeyId
    );
    return this.revokeKey.run(command);
  }
}
