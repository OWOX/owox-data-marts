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

  async prepareForAgent(
    id: string,
    payload: {
      expectedRevision: number;
      version: number;
      protectedPaths: string[][];
      reviewedNonSecretContent: true;
    }
  ): Promise<{ preparationId: string; expiresAt: string }> {
    return this.post(`/${id}/authoring-preparation`, payload, REPORTED_BY_BUILDER);
  }
  async approveAgentTest(
    id: string,
    payload: { expectedRevision: number; version: number; configuration: Record<string, unknown> }
  ): Promise<{ approvalId: string; expiresAt: string }> {
    return this.post(`/${id}/test-approval`, payload, REPORTED_BY_BUILDER);
  }
  async revokeAgentPreparation(id: string, preparationId: string): Promise<void> {
    await this.delete(`/${id}/authoring-preparations/${preparationId}`, REPORTED_BY_BUILDER);
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
  ): Promise<{ id: string; name: string; title: string; revision?: number }> {
    return this.post<{ id: string; name: string; title: string; revision?: number }>(
      '/',
      payload,
      REPORTED_BY_BUILDER
    );
  }

  async saveDraft(
    id: string,
    manifest: BuilderManifest,
    expectedRevision?: number
  ): Promise<CustomConnectorVersionSummaryDto> {
    return this.put<CustomConnectorVersionSummaryDto>(
      `/${id}/draft`,
      { manifest, ...(expectedRevision === undefined ? {} : { expectedRevision }) },
      REPORTED_BY_BUILDER
    );
  }

  async publish(
    id: string,
    expectedRevision?: number,
    version?: number
  ): Promise<PublishCustomConnectorResultDto> {
    return this.post<PublishCustomConnectorResultDto>(
      `/${id}/publish`,
      expectedRevision === undefined && version === undefined
        ? undefined
        : { expectedRevision, version },
      REPORTED_BY_BUILDER
    );
  }

  async test(payload: TestConnectorPayload): Promise<ConnectorTestResultDto> {
    return this.post<ConnectorTestResultDto>('/test', payload);
  }

  async activateVersion(
    id: string,
    version: number,
    expectedRevision?: number
  ): Promise<ActivateVersionResultDto> {
    return this.post<ActivateVersionResultDto>(
      `/${id}/versions/${version}/activate`,
      expectedRevision === undefined ? undefined : { expectedRevision },
      REPORTED_BY_BUILDER
    );
  }

  async softDelete(id: string, expectedRevision?: number): Promise<void> {
    await this.delete(
      `/${id}${expectedRevision === undefined ? '' : `?expectedRevision=${expectedRevision}`}`,
      REPORTED_BY_BUILDER
    );
  }
}
