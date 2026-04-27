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
