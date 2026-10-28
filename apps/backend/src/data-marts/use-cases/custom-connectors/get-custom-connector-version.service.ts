import { Injectable } from '@nestjs/common';
import type { GetCustomConnectorVersionCommand } from '../../dto/domain/get-custom-connector-version.command';
import type { CustomConnectorVersionDto } from '../../dto/domain/custom-connector.dto';
import { ConnectorDefinitionService } from '../../services/connector/connector-definition.service';
import { ConnectorDefinitionMapper } from '../../mappers/connector-definition.mapper';

@Injectable()
export class GetCustomConnectorVersionService {
  constructor(
    private readonly definitions: ConnectorDefinitionService,
    private readonly mapper: ConnectorDefinitionMapper
  ) {}

  async run(command: GetCustomConnectorVersionCommand): Promise<CustomConnectorVersionDto> {
    return this.mapper.toVersionDto(
      await this.definitions.getVersion(command.projectId, command.connectorId, command.version)
    );
  }
}
