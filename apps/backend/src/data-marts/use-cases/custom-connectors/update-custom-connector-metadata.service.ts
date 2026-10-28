import { Injectable } from '@nestjs/common';
import type { UpdateCustomConnectorMetadataCommand } from '../../dto/domain/update-custom-connector-metadata.command';
import type { CustomConnectorDetailDto } from '../../dto/domain/custom-connector.dto';
import { ConnectorDefinitionService } from '../../services/connector/connector-definition.service';
import { ConnectorDefinitionMapper } from '../../mappers/connector-definition.mapper';

@Injectable()
export class UpdateCustomConnectorMetadataService {
  constructor(
    private readonly definitions: ConnectorDefinitionService,
    private readonly mapper: ConnectorDefinitionMapper
  ) {}

  async run(command: UpdateCustomConnectorMetadataCommand): Promise<CustomConnectorDetailDto> {
    const definition = await this.definitions.updateMetadata(
      command.projectId,
      command.connectorId,
      command.input
    );
    const versions = await this.definitions.listVersions(command.projectId, command.connectorId);
    const activeVersion = await this.definitions.getActiveVersionNumberForDef(definition);
    return this.mapper.toDetailDto(definition, versions, activeVersion);
  }
}
