import { Injectable } from '@nestjs/common';
import { DataMartService } from '../services/data-mart.service';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { ConnectorExecutionService } from '../services/connector-execution.service';

@Injectable()
export class RunDataMartService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly connectorExecutionService: ConnectorExecutionService
  ) {}

  async run(dataMartId: string, projectId: string, userId: string): Promise<string> {
    const dataMart = await this.dataMartService.getByIdAndProjectIdAndUserId(
      dataMartId,
      projectId,
      userId
    );

    if (dataMart.definitionType !== DataMartDefinitionType.CONNECTOR) {
      throw new Error('Only data marts with connector definition type can be run manually');
    }

    const runId = await this.connectorExecutionService.run(dataMart);
    return runId;
  }
}
