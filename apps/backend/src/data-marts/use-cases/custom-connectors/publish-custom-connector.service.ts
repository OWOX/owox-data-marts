import { Injectable } from '@nestjs/common';
import type { PublishCustomConnectorCommand } from '../../dto/domain/publish-custom-connector.command';
import type { CustomConnectorPublishedDto } from '../../dto/domain/custom-connector.dto';
import { ConnectorDefinitionService } from '../../services/connector/connector-definition.service';
import { ConnectorDefinitionMapper } from '../../mappers/connector-definition.mapper';

@Injectable()
export class PublishCustomConnectorService {
  constructor(
    private readonly definitions: ConnectorDefinitionService,
    private readonly mapper: ConnectorDefinitionMapper
  ) {}

  async run(command: PublishCustomConnectorCommand): Promise<CustomConnectorPublishedDto> {
    const { version, warnings } = await this.definitions.publish(
      command.projectId,
      command.connectorId,
      {
        userId: command.userId,
        roles: command.roles,
      }
    );
    return this.mapper.toPublishedDto(version, warnings);
  }
}
