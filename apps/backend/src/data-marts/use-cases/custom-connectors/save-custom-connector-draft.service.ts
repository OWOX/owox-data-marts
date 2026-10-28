import { Injectable } from '@nestjs/common';
import type { SaveCustomConnectorDraftCommand } from '../../dto/domain/save-custom-connector-draft.command';
import type { CustomConnectorVersionStateDto } from '../../dto/domain/custom-connector.dto';
import { ConnectorDefinitionService } from '../../services/connector/connector-definition.service';
import { ConnectorDefinitionMapper } from '../../mappers/connector-definition.mapper';

@Injectable()
export class SaveCustomConnectorDraftService {
  constructor(
    private readonly definitions: ConnectorDefinitionService,
    private readonly mapper: ConnectorDefinitionMapper
  ) {}

  async run(command: SaveCustomConnectorDraftCommand): Promise<CustomConnectorVersionStateDto> {
    return this.mapper.toVersionStateDto(
      await this.definitions.saveDraft(command.projectId, command.connectorId, command.manifest)
    );
  }
}
