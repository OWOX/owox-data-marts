import { Injectable } from '@nestjs/common';
import { ConnectorService } from '../../services/connector/connector.service';
import { ConnectorSpecification } from '../../connector-types/connector-specification';

@Injectable()
export class SpecificationConnectorService {
  constructor(private readonly connectorService: ConnectorService) {}

  async run(connectorName: string): Promise<ConnectorSpecification> {
    return this.connectorService.getConnectorSpecification(connectorName);
  }
}
