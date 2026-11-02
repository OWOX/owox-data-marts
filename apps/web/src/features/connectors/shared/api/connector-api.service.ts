import { ApiService } from '../../../../services/api-service';
import type { AxiosRequestConfig } from '../../../../app/api';
import type { OAuthExchangeCredentialTarget } from './types/request';
import type {
  ConnectorDefinitionDto,
  ConnectorSpecificationResponseApiDto,
  ConnectorFieldsResponseApiDto,
  ConnectorFieldOptionResponseApiDto,
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

  /** `dataMartId` lets an editor of the Data Mart preview a configuration bound to a Credential. */
  async previewConnectorFields(
    connectorName: string,
    configuration: Record<string, unknown>,
    config?: AxiosRequestConfig,
    dataMartId?: string
  ): Promise<ConnectorFieldsResponseApiDto[]> {
    return this.post<ConnectorFieldsResponseApiDto[]>(
      `/${connectorName}/fields/preview`,
      { configuration, dataMartId },
      config
    );
  }

  async previewConnectorFieldOptions(
    connectorName: string,
    field: string,
    configuration: Record<string, unknown>,
    config?: AxiosRequestConfig,
    dataMartId?: string
  ): Promise<ConnectorFieldOptionResponseApiDto[]> {
    return this.post<ConnectorFieldOptionResponseApiDto[]>(
      `/${connectorName}/options/preview`,
      { field, configuration, dataMartId },
      config
    );
  }

  async getCustomConnectorSpecification(
    id: string,
    version?: number
  ): Promise<ConnectorSpecificationResponseApiDto[]> {
    const q = version !== undefined ? `?version=${version}` : '';
    return this.get<ConnectorSpecificationResponseApiDto[]>(`/custom/${id}/specification${q}`);
  }

  async getCustomConnectorFields(
    id: string,
    version?: number
  ): Promise<ConnectorFieldsResponseApiDto[]> {
    const q = version !== undefined ? `?version=${version}` : '';
    return this.get<ConnectorFieldsResponseApiDto[]>(`/custom/${id}/fields${q}`);
  }

  async exchangeCredentials(
    connectorName: string,
    payload: {
      fieldPath: string;
      payload: Record<string, unknown>;
      credential?: OAuthExchangeCredentialTarget;
    }
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
    return this.get<OAuthSettingsResponseDto>(
      `/${connectorName}/oauth/settings?path=${encodeURIComponent(path)}`
    );
  }
}
