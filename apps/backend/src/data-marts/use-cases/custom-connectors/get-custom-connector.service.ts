import { Injectable } from '@nestjs/common';
import type { GetCustomConnectorCommand } from '../../dto/domain/get-custom-connector.command';
import type { CustomConnectorDetailDto } from '../../dto/domain/custom-connector.dto';
import { ConnectorDefinitionService } from '../../services/connector/connector-definition.service';
import { ConnectorDefinitionMapper } from '../../mappers/connector-definition.mapper';

@Injectable()
export class GetCustomConnectorService {
  constructor(
    private readonly definitions: ConnectorDefinitionService,
    private readonly mapper: ConnectorDefinitionMapper
  ) {}

  async run(command: GetCustomConnectorCommand): Promise<CustomConnectorDetailDto> {
    const definition = await this.definitions.getById(command.projectId, command.connectorId);
    const versions = await this.definitions.listVersions(command.projectId, command.connectorId);
    const activeVersion = await this.definitions.getActiveVersionNumberForDef(definition);
    return this.mapper.toDetailDto(definition, versions, activeVersion);
  }
}
