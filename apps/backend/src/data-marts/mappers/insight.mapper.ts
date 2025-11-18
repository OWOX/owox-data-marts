import { Injectable } from '@nestjs/common';
import { AuthorizationContext } from '../../idp';
import { CreateInsightCommand } from '../dto/domain/create-insight.command';
import { DeleteInsightCommand } from '../dto/domain/delete-insight.command';
import { GetInsightCommand } from '../dto/domain/get-insight.command';
import { InsightDto } from '../dto/domain/insight.dto';
import { ListInsightsCommand } from '../dto/domain/list-insights.command';
import { UpdateInsightTitleCommand } from '../dto/domain/update-insight-title.command';
import { UpdateInsightCommand } from '../dto/domain/update-insight.command';
import { CreateInsightRequestApiDto } from '../dto/presentation/create-insight-request-api.dto';
import { InsightListItemResponseApiDto } from '../dto/presentation/insight-list-item-response-api.dto';
import { InsightResponseApiDto } from '../dto/presentation/insight-response-api.dto';
import { UpdateInsightRequestApiDto } from '../dto/presentation/update-insight-request-api.dto';
import { UpdateInsightTitleApiDto } from '../dto/presentation/update-insight-title-api.dto';
import { Insight } from '../entities/insight.entity';

@Injectable()
export class InsightMapper {
  toCreateDomainCommand(
    dataMartId: string,
    context: AuthorizationContext,
    dto: CreateInsightRequestApiDto
  ): CreateInsightCommand {
    return new CreateInsightCommand(
      dataMartId,
      context.projectId,
      context.userId,
      dto.title,
      dto.template
    );
  }

  toDomainDto(entity: Insight): InsightDto {
    return new InsightDto(
      entity.id,
      entity.title,
      entity.template ?? null,
      entity.output ?? null,
      entity.outputUpdatedAt ?? null,
      entity.createdById,
      entity.createdAt,
      entity.modifiedAt
    );
  }

  toDomainDtoList(entities: Insight[]): InsightDto[] {
    return entities.map(entity => this.toDomainDto(entity));
  }

  toResponse(dto: InsightDto): InsightResponseApiDto {
    return {
      id: dto.id,
      title: dto.title,
      template: dto.template,
      output: dto.output,
      outputUpdatedAt: dto.outputUpdatedAt,
      createdById: dto.createdById,
      createdAt: dto.createdAt,
      modifiedAt: dto.modifiedAt,
    };
  }

  toListItemResponse(dto: InsightDto): InsightListItemResponseApiDto {
    return {
      id: dto.id,
      title: dto.title,
      outputUpdatedAt: dto.outputUpdatedAt,
      createdById: dto.createdById,
      createdAt: dto.createdAt,
      modifiedAt: dto.modifiedAt,
    };
  }

  toListItemResponseList(dtos: InsightDto[]): InsightListItemResponseApiDto[] {
    return dtos.map(dto => this.toListItemResponse(dto));
  }

  toGetCommand(
    insightId: string,
    dataMartId: string,
    context: AuthorizationContext
  ): GetInsightCommand {
    return new GetInsightCommand(insightId, dataMartId, context.projectId);
  }

  toListCommand(dataMartId: string, context: AuthorizationContext): ListInsightsCommand {
    return new ListInsightsCommand(dataMartId, context.projectId);
  }

  toUpdateCommand(
    insightId: string,
    dataMartId: string,
    context: AuthorizationContext,
    dto: UpdateInsightRequestApiDto
  ): UpdateInsightCommand {
    return new UpdateInsightCommand(
      insightId,
      dataMartId,
      context.projectId,
      dto.title,
      dto.template
    );
  }

  toDeleteCommand(
    insightId: string,
    dataMartId: string,
    context: AuthorizationContext
  ): DeleteInsightCommand {
    return new DeleteInsightCommand(insightId, dataMartId, context.projectId);
  }

  toUpdateTitleCommand(
    insightId: string,
    dataMartId: string,
    context: AuthorizationContext,
    dto: UpdateInsightTitleApiDto
  ): UpdateInsightTitleCommand {
    return new UpdateInsightTitleCommand(insightId, dataMartId, context.projectId, dto.title);
  }
}
