import { Injectable } from '@nestjs/common';
import type { McpContext, McpContextSummary } from '../facades/mcp-contexts.facade';
import type { DataMartContext } from '../entities/data-mart-context.entity';
import { UserProjectionsListDto } from '../../idp/dto/domain/user-projections-list.dto';
import { ContextDto } from '../dto/domain/context.dto';
import { ContextResponseApiDto } from '../dto/presentation/context-api.dto';
import { Context } from '../entities/context.entity';

@Injectable()
export class ContextMapper {
  toMcpContext(entity: Context): McpContext {
    return { id: entity.id, name: entity.name, description: entity.description || null };
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
      entity.modifiedAt
    );
  }

  toApiResponse(dto: ContextDto): ContextResponseApiDto {
    return {
      id: dto.id,
      name: dto.name,
      description: dto.description,
      createdById: dto.createdById,
      createdByUser: dto.createdByUser,
      createdAt: dto.createdAt,
      modifiedAt: dto.modifiedAt,
    };
  }
}
