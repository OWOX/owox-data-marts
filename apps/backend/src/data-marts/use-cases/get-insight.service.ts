import { Injectable } from '@nestjs/common';
import { InsightService } from '../services/insight.service';
import { InsightMapper } from '../mappers/insight.mapper';
import { GetInsightCommand } from '../dto/domain/get-insight.command';
import { InsightDto } from '../dto/domain/insight.dto';

@Injectable()
export class GetInsightService {
  constructor(
    private readonly insightService: InsightService,
    private readonly mapper: InsightMapper
  ) {}

  async run(command: GetInsightCommand): Promise<InsightDto> {
    const insight = await this.insightService.getByIdAndDataMartIdAndProjectId(
      command.insightId,
      command.dataMartId,
      command.projectId
    );
    return this.mapper.toDomainDto(insight);
  }
}
