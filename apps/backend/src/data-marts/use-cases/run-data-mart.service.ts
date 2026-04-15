import { Injectable, ForbiddenException } from '@nestjs/common';
import { DataMartService } from '../services/data-mart.service';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { ConnectorExecutionService } from '../services/connector/connector-execution.service';
import { RunDataMartCommand } from '../dto/domain/run-data-mart.command';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';

@Injectable()
export class RunDataMartService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly connectorExecutionService: ConnectorExecutionService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(command: RunDataMartCommand): Promise<string> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

    if (command.createdById) {
      const canEdit = await this.accessDecisionService.canAccess(
        command.createdById,
        command.roles,
        EntityType.DATA_MART,
        command.id,
        Action.EDIT,
        command.projectId
      );
      if (!canEdit) {
        throw new ForbiddenException('You do not have permission to run this DataMart');
      }
    }

    if (dataMart.definitionType !== DataMartDefinitionType.CONNECTOR) {
      throw new Error('Only data marts with connector definition type can be run manually');
    }

    return await this.connectorExecutionService.run(
      dataMart,
      command.createdById,
      command.runType,
      command.payload
    );
  }
}
