import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMartService } from '../services/data-mart.service';
import { ConnectorExecutionService } from '../services/connector-execution.service';
import { CancelDataMartRunCommand } from '../dto/domain/cancel-data-mart-run.command';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';

@Injectable()
export class CancelDataMartRunService {
  constructor(
    @InjectRepository(DataMartRun)
    private readonly dataMartRunRepository: Repository<DataMartRun>,
    private readonly dataMartService: DataMartService,
    private readonly connectorExecutionService: ConnectorExecutionService
  ) {}

  async run(command: CancelDataMartRunCommand): Promise<void> {
    const dataMart = await this.dataMartService.getByIdAndProjectIdAndUserId(
      command.id,
      command.projectId
    );

    if (dataMart.definitionType !== DataMartDefinitionType.CONNECTOR) {
      throw new Error('Only data marts with connector definition can be cancelled');
    }

    await this.connectorExecutionService.cancelRun(command.id, command.runId);
  }
}
