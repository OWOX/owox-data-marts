import { Injectable } from '@nestjs/common';
import { GetInsightTemplateCommand } from '../dto/domain/get-insight-template.command';
import { InsightTemplateDto } from '../dto/domain/insight-template.dto';
import type { DataMartRun } from '../entities/data-mart-run.entity';
import { InsightTemplateMapper } from '../mappers/insight-template.mapper';
import { DataMartRunService } from '../services/data-mart-run.service';
import { InsightTemplateService } from '../services/insight-template.service';

@Injectable()
export class GetInsightTemplateService {
  constructor(
    private readonly insightTemplateService: InsightTemplateService,
    private readonly mapper: InsightTemplateMapper,
    private readonly dataMartRunService: DataMartRunService
  ) {}

  async run(command: GetInsightTemplateCommand): Promise<InsightTemplateDto> {
    const insightTemplate = await this.insightTemplateService.getByIdAndDataMartIdAndProjectId(
      command.insightTemplateId,
      command.dataMartId,
      command.projectId
    );

    let lastRun: DataMartRun | null = null;
    if (insightTemplate.lastManualDataMartRunId) {
      lastRun = await this.dataMartRunService.getByIdAndDataMartId(
        insightTemplate.lastManualDataMartRunId,
        command.dataMartId
      );
    }

    return this.mapper.toDomainDto(insightTemplate, lastRun ?? null);
  }
}
