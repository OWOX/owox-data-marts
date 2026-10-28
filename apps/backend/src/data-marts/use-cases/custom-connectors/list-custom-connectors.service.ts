import { Injectable } from '@nestjs/common';
import type { ListCustomConnectorsCommand } from '../../dto/domain/list-custom-connectors.command';
import type { CustomConnectorDto } from '../../dto/domain/custom-connector.dto';
import { ConnectorDefinitionService } from '../../services/connector/connector-definition.service';
import { ConnectorDefinitionMapper } from '../../mappers/connector-definition.mapper';

@Injectable()
export class ListCustomConnectorsService {
  constructor(
    private readonly definitions: ConnectorDefinitionService,
    private readonly mapper: ConnectorDefinitionMapper
  ) {}

  async run(command: ListCustomConnectorsCommand): Promise<CustomConnectorDto[]> {
    const definitions = await this.definitions.listByProject(command.projectId);
    const versions = await this.definitions.getActiveVersionNumbersByDefId(definitions);
    return this.mapper.toListDto(definitions, versions);
  }
}
