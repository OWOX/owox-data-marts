import { Injectable } from '@nestjs/common';
import type { GetCustomConnectorFieldsCommand } from '../../dto/domain/get-custom-connector-fields.command';
import type { ConnectorFieldsDto } from '../../dto/domain/connector-fields.dto';
import { ConnectorDefinitionService } from '../../services/connector/connector-definition.service';
import { ConnectorService } from '../../services/connector/connector.service';
import { ConnectorMapper } from '../../mappers/connector.mapper';

@Injectable()
export class GetCustomConnectorFieldsService {
  constructor(
    private readonly definitions: ConnectorDefinitionService,
    private readonly connectors: ConnectorService,
    private readonly connectorMapper: ConnectorMapper
  ) {}

  async run(command: GetCustomConnectorFieldsCommand): Promise<ConnectorFieldsDto[]> {
    const definition = await this.definitions.getById(command.projectId, command.connectorId);
    const manifest = await this.definitions.resolveManifest(
      command.projectId,
      definition.name,
      command.version
    );
    return this.connectorMapper.toFieldsDto(this.connectors.getFieldsSchemaFromManifest(manifest));
  }
}
