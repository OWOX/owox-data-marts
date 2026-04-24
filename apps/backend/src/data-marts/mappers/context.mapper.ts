import { Injectable } from '@nestjs/common';
import { UserProjectionsListDto } from '../../idp/dto/domain/user-projections-list.dto';
import { ContextDto } from '../dto/domain/context.dto';
import { ContextResponseApiDto } from '../dto/presentation/context-api.dto';
import { Context } from '../entities/context.entity';

@Injectable()
export class ContextMapper {
  toDomainDto(entity: Context, userProjections?: UserProjectionsListDto): ContextDto {
    const projection =
      entity.createdById && userProjections
        ? userProjections.getByUserId(entity.createdById)
        : undefined;

    const dto = new ContextDto();
    dto.id = entity.id;
    dto.name = entity.name;
    dto.description = entity.description ?? null;
    dto.projectId = entity.projectId;
    dto.createdById = entity.createdById ?? null;
    dto.createdByUser = projection
      ? {
          userId: projection.userId,
          email: projection.email ?? '',
          fullName: projection.fullName ?? undefined,
          avatar: projection.avatar ?? undefined,
        }
      : null;
    dto.createdAt = entity.createdAt;
    return dto;
  }

  toResponse(dto: ContextDto): ContextResponseApiDto {
    return {
      id: dto.id,
      name: dto.name,
      description: dto.description,
      createdById: dto.createdById,
      createdByUser: dto.createdByUser,
      createdAt: dto.createdAt,
    };
  }
}
