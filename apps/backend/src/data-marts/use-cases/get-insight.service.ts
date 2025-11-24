import { Injectable } from '@nestjs/common';
import { GetInsightCommand } from '../dto/domain/get-insight.command';
import { InsightDto } from '../dto/domain/insight.dto';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { Insight } from '../entities/insight.entity';
import { InsightMapper } from '../mappers/insight.mapper';
import { DataMartRunService } from '../services/data-mart-run.service';
import { InsightService } from '../services/insight.service';

@Injectable()
export class GetInsightService {
  constructor(
    private readonly insightService: InsightService,
    private readonly mapper: InsightMapper,
    private readonly dataMartRunService: DataMartRunService
  ) {}

  async run(command: GetInsightCommand): Promise<InsightDto> {
    const insight = await this.insightService.getByIdAndDataMartIdAndProjectId(
      command.insightId,
      command.dataMartId,
      command.projectId
    );

    if (insight.lastManualDataMartRunId) {
      const lastRun = await this.dataMartRunService.getByIdAndDataMartId(
        insight.lastManualDataMartRunId,
        command.dataMartId
      );
      if (lastRun) {
        (insight as Insight & { lastManualDataMartRun?: DataMartRun }).lastManualDataMartRun =
          lastRun;
      }
    }
    return this.mapper.toDomainDto(insight);
  }
}
