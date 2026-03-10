import type { AxiosRequestConfig } from '../../../../../../app/api';
import { ApiService } from '../../../../../../services';
import type {
  CreateInsightTemplateSourceRequestDto,
  InsightTemplateSourceListResponseDto,
  InsightTemplateSourceResponseDto,
  UpdateInsightTemplateSourceRequestDto,
  InsightArtifactSqlPreviewTriggerResponseDto,
} from '../types/insight-template-sources.dto';

export class InsightTemplateSourcesService extends ApiService {
  constructor() {
    super('/data-marts');
  }

  async getInsightTemplateSources(
    dataMartId: string,
    insightTemplateId: string
  ): Promise<InsightTemplateSourceListResponseDto> {
    return this.get<InsightTemplateSourceListResponseDto>(
      `/${dataMartId}/insight-templates/${insightTemplateId}/sources`
    );
  }

  async createInsightTemplateSource(
    dataMartId: string,
    insightTemplateId: string,
    data: CreateInsightTemplateSourceRequestDto
  ): Promise<InsightTemplateSourceResponseDto> {
    return this.post<InsightTemplateSourceResponseDto>(
      `/${dataMartId}/insight-templates/${insightTemplateId}/sources`,
      data
    );
  }

  async updateInsightTemplateSource(
    dataMartId: string,
    insightTemplateId: string,
    sourceId: string,
    data: UpdateInsightTemplateSourceRequestDto
  ): Promise<InsightTemplateSourceResponseDto> {
    return this.patch<InsightTemplateSourceResponseDto>(
      `/${dataMartId}/insight-templates/${insightTemplateId}/sources/${sourceId}`,
      data
    );
  }

  async deleteInsightTemplateSource(
    dataMartId: string,
    insightTemplateId: string,
    sourceId: string
  ): Promise<void> {
    await this.delete(`/${dataMartId}/insight-templates/${insightTemplateId}/sources/${sourceId}`);
  }

  async createInsightArtifactSqlPreviewTrigger(
    dataMartId: string,
    artifactId: string,
    data: { sql?: string }
  ): Promise<{ triggerId: string }> {
    return this.post<{ triggerId: string }>(
      `/${dataMartId}/insight-artifacts/${artifactId}/sql-preview-triggers`,
      data
    );
  }

  async getInsightArtifactSqlPreviewTriggerStatus(
    dataMartId: string,
    artifactId: string,
    triggerId: string
  ): Promise<{ status: string }> {
    return this.get<{ status: string }>(
      `/${dataMartId}/insight-artifacts/${artifactId}/sql-preview-triggers/${triggerId}/status`,
      undefined,
      { skipErrorToast: true } as AxiosRequestConfig
    );
  }

  async getInsightArtifactSqlPreviewTriggerResponse(
    dataMartId: string,
    artifactId: string,
    triggerId: string
  ): Promise<InsightArtifactSqlPreviewTriggerResponseDto> {
    return this.get<InsightArtifactSqlPreviewTriggerResponseDto>(
      `/${dataMartId}/insight-artifacts/${artifactId}/sql-preview-triggers/${triggerId}`,
      undefined,
      { skipErrorToast: true } as AxiosRequestConfig
    );
  }

  async abortInsightArtifactSqlPreviewTrigger(
    dataMartId: string,
    artifactId: string,
    triggerId: string
  ): Promise<void> {
    await this.delete(
      `/${dataMartId}/insight-artifacts/${artifactId}/sql-preview-triggers/${triggerId}`,
      { skipErrorToast: true } as AxiosRequestConfig
    );
  }
}

export const insightTemplateSourcesService = new InsightTemplateSourcesService();
