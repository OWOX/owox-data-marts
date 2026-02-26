import { Injectable } from '@nestjs/common';
import { InsightTemplateDto } from '../dto/domain/insight-template.dto';
import { ListInsightTemplatesCommand } from '../dto/domain/list-insight-templates.command';
import { InsightTemplateMapper } from '../mappers/insight-template.mapper';
import { InsightTemplateService } from '../services/insight-template.service';

@Injectable()
export class ListInsightTemplatesService {
  constructor(
    private readonly insightTemplateService: InsightTemplateService,
    private readonly mapper: InsightTemplateMapper
  ) {}

  async run(command: ListInsightTemplatesCommand): Promise<InsightTemplateDto[]> {
    const insightTemplates = await this.insightTemplateService.listByDataMartIdAndProjectId(
      command.dataMartId,
      command.projectId
    );

    return this.mapper.toDomainDtoList(insightTemplates);
  }
}
