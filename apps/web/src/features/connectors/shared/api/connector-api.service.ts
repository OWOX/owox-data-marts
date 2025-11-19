import { ApiService } from '../../../../services/api-service';
import type {
  ConnectorDefinitionDto,
  ConnectorSpecificationResponseApiDto,
  ConnectorFieldsResponseApiDto,
  OAuthCallbackResponseDto,
  OAuthStatusResponseDto,
  OAuthSettingsResponseDto,
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

  async exchangeCredentials(
    connectorName: string,
    payload: Record<string, unknown>
  ): Promise<OAuthCallbackResponseDto> {
    return this.post<OAuthCallbackResponseDto>(`/${connectorName}/oauth/exchange`, payload);
  }

  async checkOAuthStatus(
    connectorName: string,
    credentialId: string
  ): Promise<OAuthStatusResponseDto> {
    return this.get<OAuthStatusResponseDto>(`/${connectorName}/oauth/status/${credentialId}`);
  }

  async getOAuthSettings(connectorName: string, path: string): Promise<OAuthSettingsResponseDto> {
    return this.post<OAuthSettingsResponseDto>(`/${connectorName}/oauth/settings`, { path });
  }
}
