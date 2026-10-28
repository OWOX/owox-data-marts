import { Injectable } from '@nestjs/common';
import type { GetCustomConnectorSpecificationCommand } from '../../dto/domain/get-custom-connector-specification.command';
import type { ConnectorSpecificationDto } from '../../dto/domain/connector-specification.dto';
import { ConnectorDefinitionService } from '../../services/connector/connector-definition.service';
import { ConnectorService } from '../../services/connector/connector.service';
import { ConnectorMapper } from '../../mappers/connector.mapper';

@Injectable()
export class GetCustomConnectorSpecificationService {
  constructor(
    private readonly definitions: ConnectorDefinitionService,
    private readonly connectors: ConnectorService,
    private readonly connectorMapper: ConnectorMapper
  ) {}

  async run(command: GetCustomConnectorSpecificationCommand): Promise<ConnectorSpecificationDto[]> {
    const definition = await this.definitions.getById(command.projectId, command.connectorId);
    const manifest = await this.definitions.resolveManifest(
      command.projectId,
      definition.name,
      command.version
    );
    return this.connectorMapper.toSpecificationDto(
      this.connectors.getSpecificationFromManifest(manifest)
    );
  }
}
