import { ConflictException, Injectable, ForbiddenException } from '@nestjs/common';
import { DataMartService } from '../services/data-mart.service';
import { ConnectorExecutionService } from '../services/connector/connector-execution.service';
import { CancelDataMartRunCommand } from '../dto/domain/cancel-data-mart-run.command';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { ConnectorExecutionError } from '../errors/connector-execution.error';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';

@Injectable()
export class CancelDataMartRunService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly connectorExecutionService: ConnectorExecutionService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(command: CancelDataMartRunCommand): Promise<void> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

    if (command.userId) {
      const canEdit = await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.DATA_MART,
        command.id,
        Action.EDIT,
        command.projectId
      );
      if (!canEdit) {
        throw new ForbiddenException('You do not have permission to manage this DataMart');
      }
    }

    if (dataMart.definitionType !== DataMartDefinitionType.CONNECTOR) {
      throw new Error('Only data marts with connector definition can be cancelled');
    }

    try {
      await this.connectorExecutionService.cancelRun(command.id, command.runId);
    } catch (error) {
      if (error instanceof ConnectorExecutionError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }
}
