import { Injectable } from '@nestjs/common';
import { AuthorizationContext } from '../../idp';
import { CreateInsightArtifactCommand } from '../dto/domain/create-insight-artifact.command';
import { DeleteInsightArtifactCommand } from '../dto/domain/delete-insight-artifact.command';
import { GetInsightArtifactCommand } from '../dto/domain/get-insight-artifact.command';
import { InsightArtifactDto } from '../dto/domain/insight-artifact.dto';
import { ListInsightArtifactsCommand } from '../dto/domain/list-insight-artifacts.command';
import { UpdateInsightArtifactCommand } from '../dto/domain/update-insight-artifact.command';
import { UpdateInsightArtifactTitleCommand } from '../dto/domain/update-insight-artifact-title.command';
import { CreateInsightArtifactRequestApiDto } from '../dto/presentation/create-insight-artifact-request-api.dto';
import { InsightArtifactListItemResponseApiDto } from '../dto/presentation/insight-artifact-list-item-response-api.dto';
import { InsightArtifactResponseApiDto } from '../dto/presentation/insight-artifact-response-api.dto';
import { UpdateInsightArtifactRequestApiDto } from '../dto/presentation/update-insight-artifact-request-api.dto';
import { UpdateInsightArtifactTitleApiDto } from '../dto/presentation/update-insight-artifact-title-api.dto';
import { InsightArtifact } from '../entities/insight-artifact.entity';

@Injectable()
export class InsightArtifactMapper {
  toCreateDomainCommand(
    dataMartId: string,
    context: AuthorizationContext,
    dto: CreateInsightArtifactRequestApiDto
  ): CreateInsightArtifactCommand {
    return new CreateInsightArtifactCommand(
      dataMartId,
      context.projectId,
      context.userId,
      dto.title,
      dto.sql
    );
  }

  toDomainDto(entity: InsightArtifact): InsightArtifactDto {
    return new InsightArtifactDto(
      entity.id,
      entity.title,
      entity.sql,
      entity.validationStatus,
      entity.validationError ?? null,
      entity.createdById,
      entity.createdAt,
      entity.modifiedAt
    );
  }

  toDomainDtoList(entities: InsightArtifact[]): InsightArtifactDto[] {
    return entities.map(entity => this.toDomainDto(entity));
  }

  toResponse(dto: InsightArtifactDto): InsightArtifactResponseApiDto {
    return {
      id: dto.id,
      title: dto.title,
      sql: dto.sql,
      validationStatus: dto.validationStatus,
      validationError: dto.validationError,
      createdById: dto.createdById,
      createdAt: dto.createdAt,
      modifiedAt: dto.modifiedAt,
    };
  }

  toListItemResponse(dto: InsightArtifactDto): InsightArtifactListItemResponseApiDto {
    return {
      id: dto.id,
      title: dto.title,
      validationStatus: dto.validationStatus,
      validationError: dto.validationError,
      createdById: dto.createdById,
      createdAt: dto.createdAt,
      modifiedAt: dto.modifiedAt,
    };
  }

  toListItemResponseList(dtos: InsightArtifactDto[]): InsightArtifactListItemResponseApiDto[] {
    return dtos.map(dto => this.toListItemResponse(dto));
  }

  toGetCommand(
    insightArtifactId: string,
    dataMartId: string,
    context: AuthorizationContext
  ): GetInsightArtifactCommand {
    return new GetInsightArtifactCommand(insightArtifactId, dataMartId, context.projectId);
  }

  toListCommand(dataMartId: string, context: AuthorizationContext): ListInsightArtifactsCommand {
    return new ListInsightArtifactsCommand(dataMartId, context.projectId);
  }

  toUpdateCommand(
    insightArtifactId: string,
    dataMartId: string,
    context: AuthorizationContext,
    dto: UpdateInsightArtifactRequestApiDto
  ): UpdateInsightArtifactCommand {
    return new UpdateInsightArtifactCommand(
      insightArtifactId,
      dataMartId,
      context.projectId,
      dto.title,
      dto.sql
    );
  }

  toUpdateTitleCommand(
    insightArtifactId: string,
    dataMartId: string,
    context: AuthorizationContext,
    dto: UpdateInsightArtifactTitleApiDto
  ): UpdateInsightArtifactTitleCommand {
    return new UpdateInsightArtifactTitleCommand(
      insightArtifactId,
      dataMartId,
      context.projectId,
      dto.title
    );
  }

  toDeleteCommand(
    insightArtifactId: string,
    dataMartId: string,
    context: AuthorizationContext
  ): DeleteInsightArtifactCommand {
    return new DeleteInsightArtifactCommand(insightArtifactId, dataMartId, context.projectId);
  }
}
