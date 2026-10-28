import { Injectable } from '@nestjs/common';
import type { CreateCustomConnectorCommand } from '../../dto/domain/create-custom-connector.command';
import type { CustomConnectorCreatedDto } from '../../dto/domain/custom-connector.dto';
import { ConnectorDefinitionService } from '../../services/connector/connector-definition.service';
import { ConnectorDefinitionMapper } from '../../mappers/connector-definition.mapper';

@Injectable()
export class CreateCustomConnectorService {
  constructor(
    private readonly definitions: ConnectorDefinitionService,
    private readonly mapper: ConnectorDefinitionMapper
  ) {}

  async run(command: CreateCustomConnectorCommand): Promise<CustomConnectorCreatedDto> {
    const definition = await this.definitions.create(
      command.projectId,
      command.userId,
      command.input
    );
    return this.mapper.toCreatedDto(definition);
  }
}
