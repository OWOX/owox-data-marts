import type { AxiosRequestConfig } from '../../../../app/api';
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
  PublishCustomConnectorResultDto,
  TestConnectorPayload,
  UpdateCustomConnectorMetadataPayload,
} from './types';

/**
 * For the writes the builder reports itself, in a toast and in its error state. Without it
 * the API client toasted the same failure too, so each one showed twice.
 */
const REPORTED_BY_BUILDER: AxiosRequestConfig = { skipErrorToast: true };

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
    return this.post<{ id: string; name: string; title: string }>(
      '/',
      payload,
      REPORTED_BY_BUILDER
    );
  }

  async saveDraft(
    id: string,
    manifest: BuilderManifest
  ): Promise<CustomConnectorVersionSummaryDto> {
    return this.put<CustomConnectorVersionSummaryDto>(
      `/${id}/draft`,
      { manifest },
      REPORTED_BY_BUILDER
    );
  }

  /**
   * The manifest's display fields are also columns on the connector row, and the row is what
   * every list, picker and data-mart page reads — the builder is the only screen that reads
   * the manifest. Saving the draft alone left a retitled connector titled the old way
   * everywhere else. `name` is not updatable: data marts reference their connector by it.
   */
  async updateMetadata(
    id: string,
    metadata: UpdateCustomConnectorMetadataPayload
  ): Promise<CustomConnectorDetailDto> {
    return this.patch<CustomConnectorDetailDto>(`/${id}`, metadata, REPORTED_BY_BUILDER);
  }

  async publish(id: string): Promise<PublishCustomConnectorResultDto> {
    return this.post<PublishCustomConnectorResultDto>(
      `/${id}/publish`,
      undefined,
      REPORTED_BY_BUILDER
    );
  }

  async test(payload: TestConnectorPayload): Promise<ConnectorTestResultDto> {
    return this.post<ConnectorTestResultDto>('/test', payload);
  }

  async activateVersion(id: string, version: number): Promise<ActivateVersionResultDto> {
    return this.post<ActivateVersionResultDto>(
      `/${id}/versions/${version}/activate`,
      undefined,
      REPORTED_BY_BUILDER
    );
  }

  async softDelete(id: string): Promise<void> {
    await this.delete(`/${id}`, REPORTED_BY_BUILDER);
  }
}
