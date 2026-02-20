import { Injectable } from '@nestjs/common';
import { BatchDataMartHealthStatusResponseDto } from '../dto/domain/batch-data-mart-health-status-response.dto';
import { BatchDataMartHealthStatusCommand } from '../dto/domain/batch-data-mart-health-status.command';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartRunService } from '../services/data-mart-run.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';

@Injectable()
export class BatchDataMartHealthStatusService {
  constructor(
    private readonly dataMartRunService: DataMartRunService,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly mapper: DataMartMapper
  ) {}

  async run(
    command: BatchDataMartHealthStatusCommand
  ): Promise<BatchDataMartHealthStatusResponseDto> {
    if (!command.ids.length) {
      return new BatchDataMartHealthStatusResponseDto([]);
    }

    // 1. Fetch the latest runs by type for these data marts, filtering by project id
    const latestRuns = await this.dataMartRunService.getLatestRunsByTypeForDataMarts(
      command.ids,
      command.projectId
    );

    // 2. Fetch user projections (if runs exist)
    const userProjections =
      await this.userProjectionsFetcherService.fetchRelevantUserProjections(latestRuns);

    // 3. Map them to domain DTOs
    return this.mapper.toBatchHealthStatusDomainResponse(command.ids, latestRuns, userProjections);
  }
}
