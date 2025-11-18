import { Injectable } from '@nestjs/common';
import { RunType } from '../../common/scheduler/shared/types';
import { DataMartService } from '../services/data-mart.service';
import { InsightExecutionService } from '../services/insight-execution.service';
import { InsightService } from '../services/insight.service';

export class RunInsightCommand {
  constructor(
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly insightId: string,
    public readonly createdById: string,
    public readonly runType: RunType
  ) {}
}

@Injectable()
export class RunInsightService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly insightService: InsightService,
    private readonly executionService: InsightExecutionService
  ) {}

  async run(command: RunInsightCommand): Promise<string> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(
      command.dataMartId,
      command.projectId
    );

    const insight = await this.insightService.getByIdAndDataMartIdAndProjectId(
      command.insightId,
      command.dataMartId,
      command.projectId
    );

    return await this.executionService.run(dataMart, insight, command.createdById, command.runType);
  }
}
