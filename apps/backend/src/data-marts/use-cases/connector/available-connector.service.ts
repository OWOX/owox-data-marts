import { Injectable } from '@nestjs/common';
import { ConnectorService } from '../../services/connector.service';
import { ConnectorDefinition } from 'src/data-marts/connector-types/connector-definition';

@Injectable()
export class AvailableConnectorService {
  constructor(private readonly connectorService: ConnectorService) {}

  async run(): Promise<ConnectorDefinition[]> {
    return this.connectorService.getAvailableConnectors();
  }
}
