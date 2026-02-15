import { Injectable } from '@nestjs/common';
import { RunType } from '../../common/scheduler/shared/types';
import { DataMartService } from '../services/data-mart.service';
import { InsightTemplateExecutionService } from '../services/insight-template-execution.service';
import { InsightTemplateService } from '../services/insight-template.service';

export class RunInsightTemplateCommand {
  constructor(
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly insightTemplateId: string,
    public readonly createdById: string,
    public readonly runType: RunType
  ) {}
}

@Injectable()
export class RunInsightTemplateService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly insightTemplateService: InsightTemplateService,
    private readonly executionService: InsightTemplateExecutionService
  ) {}

  async run(command: RunInsightTemplateCommand): Promise<string> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(
      command.dataMartId,
      command.projectId
    );

    const insightTemplate = await this.insightTemplateService.getByIdAndDataMartIdAndProjectId(
      command.insightTemplateId,
      command.dataMartId,
      command.projectId
    );

    return this.executionService.run(
      dataMart,
      insightTemplate,
      command.createdById,
      command.runType
    );
  }
}
