import { Injectable } from '@nestjs/common';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartService } from '../services/data-mart.service';
import { ConnectorExecutionService } from '../services/connector/connector-execution.service';
import { GetDataMartRunsCommand } from '../dto/domain/get-data-mart-runs.command';
import { DataMartRunDto } from '../dto/domain/data-mart-run.dto';

@Injectable()
export class GetDataMartRunsService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly connectorExecutionService: ConnectorExecutionService,
    private readonly mapper: DataMartMapper
  ) {}

  async run(command: GetDataMartRunsCommand): Promise<DataMartRunDto[]> {
    await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

    const runs = await this.connectorExecutionService.getDataMartRuns(
      command.id,
      command.limit,
      command.offset
    );

    return this.mapper.toDataMartRunDtoList(runs);
  }
}
