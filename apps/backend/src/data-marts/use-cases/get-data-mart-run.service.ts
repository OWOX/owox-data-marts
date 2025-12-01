import { Injectable, NotFoundException } from '@nestjs/common';
import { DataMartRunDto } from '../dto/domain/data-mart-run.dto';
import { GetDataMartRunCommand } from '../dto/domain/get-data-mart-run.command';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartRunService } from '../services/data-mart-run.service';
import { DataMartService } from '../services/data-mart.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';

@Injectable()
export class GetDataMartRunService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly dataMartRunService: DataMartRunService,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly mapper: DataMartMapper
  ) {}

  async run(command: GetDataMartRunCommand): Promise<DataMartRunDto> {
    await this.dataMartService.getByIdAndProjectId(command.dataMartId, command.projectId);

    const run = await this.dataMartRunService.getByIdAndDataMartId(
      command.runId,
      command.dataMartId
    );
    if (!run) {
      throw new NotFoundException('Run not found');
    }

    const userProjection = run.createdById
      ? await this.userProjectionsFetcherService.fetchUserProjection(run.createdById)
      : undefined;

    return this.mapper.toDataMartRunDto(run, userProjection);
  }
}
