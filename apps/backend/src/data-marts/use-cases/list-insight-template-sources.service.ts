import { Injectable } from '@nestjs/common';
import { InsightTemplateSourceDetailsDto } from '../dto/domain/insight-template-source-details.dto';
import { ListInsightTemplateSourcesCommand } from '../dto/domain/list-insight-template-sources.command';
import { InsightTemplateSourceMapper } from '../mappers/insight-template-source.mapper';
import { InsightTemplateService } from '../services/insight-template.service';
import { InsightTemplateSourceService } from '../services/insight-template-source.service';

@Injectable()
export class ListInsightTemplateSourcesService {
  constructor(
    private readonly insightTemplateService: InsightTemplateService,
    private readonly insightTemplateSourceService: InsightTemplateSourceService,
    private readonly mapper: InsightTemplateSourceMapper
  ) {}

  async run(
    command: ListInsightTemplateSourcesCommand
  ): Promise<InsightTemplateSourceDetailsDto[]> {
    const template = await this.insightTemplateService.getByIdAndDataMartIdAndProjectId(
      command.insightTemplateId,
      command.dataMartId,
      command.projectId
    );
    const sources = await this.insightTemplateSourceService.listByTemplateId(template.id);

    return this.mapper.toDomainDtoList(sources);
  }
}
