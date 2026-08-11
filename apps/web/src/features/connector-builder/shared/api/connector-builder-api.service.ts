import { ApiService } from '../../../../services/api-service';
import type { BuilderManifest } from '../model/manifest.types';
import type {
  ActivateVersionResultDto,
  ConnectorTestResultDto,
  CreateCustomConnectorPayload,
  CustomConnectorDetailDto,
  CustomConnectorListItemDto,
  CustomConnectorVersionDto,
  CustomConnectorVersionSummaryDto,
  TestConnectorPayload,
} from './types';

export class ConnectorBuilderApiService extends ApiService {
  constructor() {
    super('/connectors/custom');
  }

  async list(): Promise<CustomConnectorListItemDto[]> {
    return this.get<CustomConnectorListItemDto[]>('/');
  }

  async getById(id: string): Promise<CustomConnectorDetailDto> {
    return this.get<CustomConnectorDetailDto>(`/${id}`);
  }

  async getVersion(id: string, version: number): Promise<CustomConnectorVersionDto> {
    return this.get<CustomConnectorVersionDto>(`/${id}/versions/${version}`);
  }

  async create(
    payload: CreateCustomConnectorPayload
  ): Promise<{ id: string; name: string; title: string }> {
    return this.post<{ id: string; name: string; title: string }>('/', payload);
  }

  async saveDraft(
    id: string,
    manifest: BuilderManifest
  ): Promise<CustomConnectorVersionSummaryDto> {
    return this.put<CustomConnectorVersionSummaryDto>(`/${id}/draft`, { manifest });
  }

  async publish(id: string): Promise<CustomConnectorVersionSummaryDto> {
    return this.post<CustomConnectorVersionSummaryDto>(`/${id}/publish`);
  }

  async test(payload: TestConnectorPayload): Promise<ConnectorTestResultDto> {
    return this.post<ConnectorTestResultDto>('/test', payload);
  }

  async activateVersion(id: string, version: number): Promise<ActivateVersionResultDto> {
    return this.post<ActivateVersionResultDto>(`/${id}/versions/${version}/activate`);
  }

  async softDelete(id: string): Promise<void> {
    await this.delete(`/${id}`);
  }
}
