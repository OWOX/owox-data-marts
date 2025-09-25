import { Injectable } from '@nestjs/common';
import { ConnectorService } from '../../services/connector.service';
import { ConnectorFieldsSchema } from '../../connector-types/connector-fields-schema';

@Injectable()
export class FieldsConnectorService {
  constructor(private readonly connectorService: ConnectorService) {}

  async run(connectorName: string): Promise<ConnectorFieldsSchema> {
    return await this.connectorService.getConnectorFieldsSchema(connectorName);
  }
}
