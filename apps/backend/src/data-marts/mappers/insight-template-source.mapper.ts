import { Injectable } from '@nestjs/common';
import { AuthorizationContext } from '../../idp';
import { CreateInsightTemplateSourceCommand } from '../dto/domain/create-insight-template-source.command';
import { DeleteInsightTemplateSourceCommand } from '../dto/domain/delete-insight-template-source.command';
import { InsightTemplateSourceDetailsDto } from '../dto/domain/insight-template-source-details.dto';
import { ListInsightTemplateSourcesCommand } from '../dto/domain/list-insight-template-sources.command';
import { UpdateInsightTemplateSourceCommand } from '../dto/domain/update-insight-template-source.command';
import { CreateInsightTemplateSourceRequestApiDto } from '../dto/presentation/create-insight-template-source-request-api.dto';
import { InsightTemplateSourceDetailsApiDto } from '../dto/presentation/insight-template-source-details-api.dto';
import { UpdateInsightTemplateSourceRequestApiDto } from '../dto/presentation/update-insight-template-source-request-api.dto';
import { InsightTemplateSourceEntity } from '../entities/insight-template-source.entity';

@Injectable()
export class InsightTemplateSourceMapper {
  toCreateCommand(
    insightTemplateId: string,
    dataMartId: string,
    context: AuthorizationContext,
    dto: CreateInsightTemplateSourceRequestApiDto
  ): CreateInsightTemplateSourceCommand {
    return new CreateInsightTemplateSourceCommand(
      insightTemplateId,
      dataMartId,
      context.projectId,
      context.userId,
      dto.key,
      dto.title,
      dto.sql
    );
  }

  toUpdateCommand(
    sourceId: string,
    insightTemplateId: string,
    dataMartId: string,
    context: AuthorizationContext,
    dto: UpdateInsightTemplateSourceRequestApiDto
  ): UpdateInsightTemplateSourceCommand {
    return new UpdateInsightTemplateSourceCommand(
      sourceId,
      insightTemplateId,
      dataMartId,
      context.projectId,
      dto.title,
      dto.sql
    );
  }

  toListCommand(
    insightTemplateId: string,
    dataMartId: string,
    context: AuthorizationContext
  ): ListInsightTemplateSourcesCommand {
    return new ListInsightTemplateSourcesCommand(insightTemplateId, dataMartId, context.projectId);
  }

  toDeleteCommand(
    sourceId: string,
    insightTemplateId: string,
    dataMartId: string,
    context: AuthorizationContext
  ): DeleteInsightTemplateSourceCommand {
    return new DeleteInsightTemplateSourceCommand(
      sourceId,
      insightTemplateId,
      dataMartId,
      context.projectId
    );
  }

  toDomainDto(entity: InsightTemplateSourceEntity): InsightTemplateSourceDetailsDto {
    const artifact = entity.insightArtifact;

    return new InsightTemplateSourceDetailsDto(
      entity.id,
      entity.key,
      entity.artifactId,
      artifact.title,
      artifact.sql,
      artifact.validationStatus,
      artifact.validationError ?? null,
      artifact.createdById,
      entity.createdAt,
      artifact.modifiedAt
    );
  }

  toDomainDtoList(entities: InsightTemplateSourceEntity[]): InsightTemplateSourceDetailsDto[] {
    return entities.map(entity => this.toDomainDto(entity));
  }

  toResponse(dto: InsightTemplateSourceDetailsDto): InsightTemplateSourceDetailsApiDto {
    return {
      templateSourceId: dto.templateSourceId,
      key: dto.key,
      artifactId: dto.artifactId,
      title: dto.title,
      sql: dto.sql,
      validationStatus: dto.validationStatus,
      validationError: dto.validationError,
      createdById: dto.createdById,
      createdAt: dto.createdAt,
      modifiedAt: dto.modifiedAt,
    };
  }

  toResponseList(dtos: InsightTemplateSourceDetailsDto[]): InsightTemplateSourceDetailsApiDto[] {
    return dtos.map(dto => this.toResponse(dto));
  }
}
