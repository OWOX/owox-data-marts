import { Injectable } from '@nestjs/common';
import { AuthorizationContext } from '../../idp';
import { Insight } from '../entities/insight.entity';
import { InsightDto } from '../dto/domain/insight.dto';
import { CreateInsightRequestApiDto } from '../dto/presentation/create-insight-request-api.dto';
import { UpdateInsightRequestApiDto } from '../dto/presentation/update-insight-request-api.dto';
import { InsightResponseApiDto } from '../dto/presentation/insight-response-api.dto';
import { CreateInsightCommand } from '../dto/domain/create-insight.command';
import { GetInsightCommand } from '../dto/domain/get-insight.command';
import { ListInsightsCommand } from '../dto/domain/list-insights.command';
import { UpdateInsightCommand } from '../dto/domain/update-insight.command';
import { DeleteInsightCommand } from '../dto/domain/delete-insight.command';

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
      createdById: dto.createdById,
      createdAt: dto.createdAt,
      modifiedAt: dto.modifiedAt,
    };
  }

  toResponseList(dtos: InsightDto[]): InsightResponseApiDto[] {
    return dtos.map(dto => this.toResponse(dto));
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
}
