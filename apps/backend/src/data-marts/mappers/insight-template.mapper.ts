import { Injectable } from '@nestjs/common';
import { AuthorizationContext } from '../../idp';
import { CreateInsightTemplateCommand } from '../dto/domain/create-insight-template.command';
import { DeleteInsightTemplateCommand } from '../dto/domain/delete-insight-template.command';
import { GetInsightTemplateCommand } from '../dto/domain/get-insight-template.command';
import { InsightTemplateDto } from '../dto/domain/insight-template.dto';
import { ListInsightTemplatesCommand } from '../dto/domain/list-insight-templates.command';
import { UpdateInsightTemplateCommand } from '../dto/domain/update-insight-template.command';
import { UpdateInsightTemplateTitleCommand } from '../dto/domain/update-insight-template-title.command';
import { CreateInsightTemplateRequestApiDto } from '../dto/presentation/create-insight-template-request-api.dto';
import { InsightTemplateListItemResponseApiDto } from '../dto/presentation/insight-template-list-item-response-api.dto';
import { InsightTemplateResponseApiDto } from '../dto/presentation/insight-template-response-api.dto';
import { UpdateInsightTemplateRequestApiDto } from '../dto/presentation/update-insight-template-request-api.dto';
import { UpdateInsightTemplateTitleApiDto } from '../dto/presentation/update-insight-template-title-api.dto';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { InsightTemplate } from '../entities/insight-template.entity';
import { DataMartMapper } from './data-mart.mapper';

@Injectable()
export class InsightTemplateMapper {
  constructor(private readonly dataMartMapper: DataMartMapper) {}

  toCreateDomainCommand(
    dataMartId: string,
    context: AuthorizationContext,
    dto: CreateInsightTemplateRequestApiDto
  ): CreateInsightTemplateCommand {
    return new CreateInsightTemplateCommand(
      dataMartId,
      context.projectId,
      context.userId,
      dto.title,
      dto.template,
      dto.sources ?? []
    );
  }

  toDomainDto(
    entity: InsightTemplate,
    lastManualDataMartRun?: DataMartRun | null
  ): InsightTemplateDto {
    const lastManualDataMartRunDto = lastManualDataMartRun
      ? this.dataMartMapper.toDataMartRunDto(lastManualDataMartRun)
      : null;

    return new InsightTemplateDto(
      entity.id,
      entity.title,
      entity.template ?? null,
      entity.sources ?? [],
      entity.output ?? null,
      entity.outputUpdatedAt ?? null,
      entity.createdById,
      entity.createdAt,
      entity.modifiedAt,
      lastManualDataMartRunDto
    );
  }

  toDomainDtoList(entities: InsightTemplate[]): InsightTemplateDto[] {
    return entities.map(entity => this.toDomainDto(entity, null));
  }

  async toResponse(dto: InsightTemplateDto): Promise<InsightTemplateResponseApiDto> {
    return {
      id: dto.id,
      title: dto.title,
      template: dto.template,
      sources: dto.sources,
      output: dto.output,
      outputUpdatedAt: dto.outputUpdatedAt,
      createdById: dto.createdById,
      createdAt: dto.createdAt,
      modifiedAt: dto.modifiedAt,
      lastManualDataMartRun: dto.lastManualDataMartRun
        ? await this.dataMartMapper.toRunResponse(dto.lastManualDataMartRun)
        : null,
    };
  }

  toListItemResponse(dto: InsightTemplateDto): InsightTemplateListItemResponseApiDto {
    return {
      id: dto.id,
      title: dto.title,
      sourcesCount: dto.sources.length,
      outputUpdatedAt: dto.outputUpdatedAt,
      createdById: dto.createdById,
      createdAt: dto.createdAt,
      modifiedAt: dto.modifiedAt,
    };
  }

  toListItemResponseList(dtos: InsightTemplateDto[]): InsightTemplateListItemResponseApiDto[] {
    return dtos.map(dto => this.toListItemResponse(dto));
  }

  toGetCommand(
    insightTemplateId: string,
    dataMartId: string,
    context: AuthorizationContext
  ): GetInsightTemplateCommand {
    return new GetInsightTemplateCommand(insightTemplateId, dataMartId, context.projectId);
  }

  toListCommand(dataMartId: string, context: AuthorizationContext): ListInsightTemplatesCommand {
    return new ListInsightTemplatesCommand(dataMartId, context.projectId);
  }

  toUpdateCommand(
    insightTemplateId: string,
    dataMartId: string,
    context: AuthorizationContext,
    dto: UpdateInsightTemplateRequestApiDto
  ): UpdateInsightTemplateCommand {
    return new UpdateInsightTemplateCommand(
      insightTemplateId,
      dataMartId,
      context.projectId,
      dto.title,
      dto.template,
      dto.sources
    );
  }

  toUpdateTitleCommand(
    insightTemplateId: string,
    dataMartId: string,
    context: AuthorizationContext,
    dto: UpdateInsightTemplateTitleApiDto
  ): UpdateInsightTemplateTitleCommand {
    return new UpdateInsightTemplateTitleCommand(
      insightTemplateId,
      dataMartId,
      context.projectId,
      dto.title
    );
  }

  toDeleteCommand(
    insightTemplateId: string,
    dataMartId: string,
    context: AuthorizationContext
  ): DeleteInsightTemplateCommand {
    return new DeleteInsightTemplateCommand(insightTemplateId, dataMartId, context.projectId);
  }
}
