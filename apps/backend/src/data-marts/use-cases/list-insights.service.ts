import { Injectable } from '@nestjs/common';
import { InsightService } from '../services/insight.service';
import { InsightMapper } from '../mappers/insight.mapper';
import { ListInsightsCommand } from '../dto/domain/list-insights.command';
import { InsightDto } from '../dto/domain/insight.dto';

@Injectable()
export class ListInsightsService {
  constructor(
    private readonly insightService: InsightService,
    private readonly mapper: InsightMapper
  ) {}

  async run(command: ListInsightsCommand): Promise<InsightDto[]> {
    const insights = await this.insightService.listByDataMartIdAndProjectId(
      command.dataMartId,
      command.projectId
    );
    return this.mapper.toDomainDtoList(insights);
  }
}
