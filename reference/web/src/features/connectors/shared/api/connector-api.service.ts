import { ApiService } from '../../../../services/api-service';
import type {
  ConnectorDefinitionDto,
  ConnectorSpecificationResponseApiDto,
  ConnectorFieldsResponseApiDto,
} from './types/response';

export class ConnectorApiService extends ApiService {
  constructor() {
    super('/connectors');
  }

  async getAvailableConnectors(): Promise<ConnectorDefinitionDto[]> {
    return this.get<ConnectorDefinitionDto[]>('/');
  }

  async getConnectorSpecification(
    connectorName: string
  ): Promise<ConnectorSpecificationResponseApiDto[]> {
    return this.get<ConnectorSpecificationResponseApiDto[]>(`/${connectorName}/specification`);
  }

  async getConnectorFields(connectorName: string): Promise<ConnectorFieldsResponseApiDto[]> {
    return this.get<ConnectorFieldsResponseApiDto[]>(`/${connectorName}/fields`);
  }
}
