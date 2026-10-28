import { Injectable } from '@nestjs/common';
import type { DeleteCustomConnectorCommand } from '../../dto/domain/delete-custom-connector.command';
import { ConnectorDefinitionService } from '../../services/connector/connector-definition.service';

@Injectable()
export class DeleteCustomConnectorService {
  constructor(private readonly definitions: ConnectorDefinitionService) {}

  run(command: DeleteCustomConnectorCommand): Promise<void> {
    return this.definitions.softDelete(command.projectId, command.connectorId);
  }
}
