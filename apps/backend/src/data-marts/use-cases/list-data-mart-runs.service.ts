import { Injectable } from '@nestjs/common';
import { DataMartRunDto } from '../dto/domain/data-mart-run.dto';
import { GetDataMartRunsCommand } from '../dto/domain/get-data-mart-runs.command';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartRunService } from '../services/data-mart-run.service';
import { DataMartService } from '../services/data-mart.service';

@Injectable()
export class ListDataMartRunsService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly dataMartRunService: DataMartRunService,
    private readonly mapper: DataMartMapper
  ) {}

  async run(command: GetDataMartRunsCommand): Promise<DataMartRunDto[]> {
    await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

    const runs = await this.dataMartRunService.listByDataMartId(
      command.id,
      command.limit,
      command.offset
    );

    return this.mapper.toDataMartRunDtoList(runs);
  }
}
