import { Injectable } from '@nestjs/common';
import type { ActivateCustomConnectorVersionCommand } from '../../dto/domain/activate-custom-connector-version.command';
import type { CustomConnectorActivatedDto } from '../../dto/domain/custom-connector.dto';
import { ConnectorDefinitionService } from '../../services/connector/connector-definition.service';
import { ConnectorDefinitionMapper } from '../../mappers/connector-definition.mapper';

@Injectable()
export class ActivateCustomConnectorVersionService {
  constructor(
    private readonly definitions: ConnectorDefinitionService,
    private readonly mapper: ConnectorDefinitionMapper
  ) {}

  async run(command: ActivateCustomConnectorVersionCommand): Promise<CustomConnectorActivatedDto> {
    const definition = await this.definitions.setActiveVersion(
      command.projectId,
      command.connectorId,
      command.version,
      {
        userId: command.userId,
        roles: command.roles,
      }
    );
    return this.mapper.toActivatedDto(definition, command.version);
  }
}
