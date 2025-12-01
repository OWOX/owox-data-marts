import { Injectable } from '@nestjs/common';
import { DataMartRunDto } from '../dto/domain/data-mart-run.dto';
import { GetDataMartRunsCommand } from '../dto/domain/get-data-mart-runs.command';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartRunService } from '../services/data-mart-run.service';
import { DataMartService } from '../services/data-mart.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';

@Injectable()
export class ListDataMartRunsService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly dataMartRunService: DataMartRunService,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly mapper: DataMartMapper
  ) {}

  async run(command: GetDataMartRunsCommand): Promise<DataMartRunDto[]> {
    await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

    const runs = await this.dataMartRunService.listByDataMartId(
      command.id,
      command.limit,
      command.offset
    );

    const userProjections =
      await this.userProjectionsFetcherService.fetchRelevantUserProjections(runs);

    return this.mapper.toDataMartRunDtoList(runs, userProjections);
  }
}
