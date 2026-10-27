import { Injectable } from '@nestjs/common';
import type { McpContext, McpContextSummary } from '../facades/mcp-contexts.facade';
import type { DataMartContext } from '../entities/data-mart-context.entity';
import { UserProjectionsListDto } from '../../idp/dto/domain/user-projections-list.dto';
import { ContextDto, ContextImpactDto } from '../dto/domain/context.dto';
import type { AuthorizationContext } from '../../idp';
import { CreateContextCommand } from '../dto/domain/create-context.command';
import { UpdateContextMetadataCommand } from '../dto/domain/update-context-metadata.command';
import { GetContextImpactCommand } from '../dto/domain/get-context-impact.command';
import { DeleteContextCommand } from '../dto/domain/delete-context.command';
import { SetContextMembersCommand } from '../dto/domain/set-context-members.command';
import { ListContextsCommand } from '../dto/domain/list-contexts.command';
import {
  ContextResponseApiDto,
  ContextImpactResponseApiDto,
  CreateContextRequestApiDto,
  UpdateContextRequestApiDto,
  UpdateContextIconApiDto,
  UpdateContextMembersRequestApiDto,
} from '../dto/presentation/context-api.dto';
import { Context } from '../entities/context.entity';

@Injectable()
export class ContextMapper {
  toListCommand(actor: AuthorizationContext): ListContextsCommand {
    return new ListContextsCommand(actor.projectId);
  }

  toCreateCommand(
    actor: AuthorizationContext,
    dto: CreateContextRequestApiDto
  ): CreateContextCommand {
    return new CreateContextCommand(
      actor.projectId,
      actor.userId,
      dto.name,
      dto.description,
      dto.icon
    );
  }

  toUpdateMetadataCommand(
    actor: AuthorizationContext,
    contextId: string,
    dto: UpdateContextRequestApiDto
  ): UpdateContextMetadataCommand {
    return new UpdateContextMetadataCommand(
      contextId,
      actor.projectId,
      dto.name,
      dto.description,
      dto.icon
    );
  }

  toUpdateIconCommand(
    actor: AuthorizationContext,
    contextId: string,
    dto: UpdateContextIconApiDto
  ): UpdateContextMetadataCommand {
    return new UpdateContextMetadataCommand(
      contextId,
      actor.projectId,
      undefined,
      undefined,
      dto.icon
    );
  }

  toGetImpactCommand(actor: AuthorizationContext, contextId: string): GetContextImpactCommand {
    return new GetContextImpactCommand(contextId, actor.projectId);
  }

  toDeleteCommand(actor: AuthorizationContext, contextId: string): DeleteContextCommand {
    return new DeleteContextCommand(contextId, actor.projectId);
  }

  toSetMembersCommand(
    actor: AuthorizationContext,
    contextId: string,
    dto: UpdateContextMembersRequestApiDto
  ): SetContextMembersCommand {
    return new SetContextMembersCommand(contextId, actor.projectId, dto.assignedUserIds);
  }

  toImpactResponse(dto: ContextImpactDto): ContextImpactResponseApiDto {
    return {
      contextId: dto.contextId,
      contextName: dto.contextName,
      dataMartCount: dto.dataMartCount,
      storageCount: dto.storageCount,
      destinationCount: dto.destinationCount,
      memberCount: dto.memberCount,
      userProvisioningDefaultsCount: dto.userProvisioningDefaultsCount,
      affectedMemberIds: dto.affectedMemberIds,
    };
  }

  toMcpContext(entity: ContextDto): McpContext {
    return {
      id: entity.id,
      name: entity.name,
      description: entity.description ?? null,
      icon: entity.icon,
    };
  }
  toDataMartContextSummaries(rows: DataMartContext[]): Record<string, McpContextSummary[]> {
    const result: Record<string, McpContextSummary[]> = {};
    for (const row of rows) {
      if (!row.context || row.context.deletedAt) continue;
      (result[row.dataMartId] ??= []).push({ id: row.context.id, name: row.context.name });
    }
    return result;
  }

  toDomainDto(entity: Context, userProjections?: UserProjectionsListDto): ContextDto {
    const projection =
      entity.createdById && userProjections
        ? userProjections.getByUserId(entity.createdById)
        : undefined;

    return new ContextDto(
      entity.id,
      entity.name,
      entity.description ?? null,
      entity.projectId,
      entity.createdById ?? null,
      projection ?? null,
      entity.createdAt,
      entity.modifiedAt,
      entity.icon ?? null
    );
  }

  toApiResponse(dto: ContextDto): ContextResponseApiDto {
    return {
      id: dto.id,
      name: dto.name,
      description: dto.description,
      icon: dto.icon,
      createdById: dto.createdById,
      createdByUser: dto.createdByUser,
      createdAt: dto.createdAt,
      modifiedAt: dto.modifiedAt,
    };
  }
}
