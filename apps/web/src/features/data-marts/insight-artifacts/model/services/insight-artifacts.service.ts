import { ApiService } from '../../../../../services';
import type { AxiosRequestConfig } from 'axios';
import type { TaskStatus } from '../../../../../shared/types/task-status.enum.ts';
import type {
  CreateInsightArtifactSqlPreviewTriggerResponseDto,
  CreateInsightArtifactRequestDto,
  InsightArtifactListResponseDto,
  InsightArtifactSqlPreviewResponseDto,
  InsightArtifactSqlPreviewTriggerStatusResponseDto,
  InsightArtifactResponseDto,
  RunInsightArtifactSqlPreviewRequestDto,
  UpdateInsightArtifactRequestDto,
} from '../types/insight-artifacts.dto';

export class InsightArtifactsService extends ApiService {
  constructor() {
    super('/data-marts');
  }

  async getInsightArtifacts(dataMartId: string): Promise<InsightArtifactListResponseDto> {
    return this.get<InsightArtifactListResponseDto>(`/${dataMartId}/insight-artifacts`);
  }

  async getInsightArtifactById(
    dataMartId: string,
    id: string
  ): Promise<InsightArtifactResponseDto> {
    return this.get<InsightArtifactResponseDto>(`/${dataMartId}/insight-artifacts/${id}`);
  }

  async createInsightArtifact(
    dataMartId: string,
    data: CreateInsightArtifactRequestDto
  ): Promise<InsightArtifactResponseDto> {
    return this.post<InsightArtifactResponseDto>(`/${dataMartId}/insight-artifacts`, data);
  }

  async updateInsightArtifact(
    dataMartId: string,
    id: string,
    data: UpdateInsightArtifactRequestDto
  ): Promise<InsightArtifactResponseDto> {
    return this.put<InsightArtifactResponseDto>(`/${dataMartId}/insight-artifacts/${id}`, data);
  }

  async updateInsightArtifactTitle(
    dataMartId: string,
    id: string,
    title: string
  ): Promise<InsightArtifactResponseDto> {
    return this.put<InsightArtifactResponseDto>(`/${dataMartId}/insight-artifacts/${id}/title`, {
      title,
    });
  }

  async deleteInsightArtifact(dataMartId: string, id: string): Promise<void> {
    return this.delete(`/${dataMartId}/insight-artifacts/${id}`);
  }

  async createInsightArtifactSqlPreviewTrigger(
    dataMartId: string,
    id: string,
    data: RunInsightArtifactSqlPreviewRequestDto
  ): Promise<CreateInsightArtifactSqlPreviewTriggerResponseDto> {
    return this.post<CreateInsightArtifactSqlPreviewTriggerResponseDto>(
      `/${dataMartId}/insight-artifacts/${id}/sql-preview-triggers`,
      data,
      { skipLoadingIndicator: true } as AxiosRequestConfig
    );
  }

  async getInsightArtifactSqlPreviewTriggerStatus(
    dataMartId: string,
    insightArtifactId: string,
    triggerId: string
  ): Promise<TaskStatus> {
    const response = await this.get<InsightArtifactSqlPreviewTriggerStatusResponseDto>(
      `/${dataMartId}/insight-artifacts/${insightArtifactId}/sql-preview-triggers/${triggerId}/status`,
      undefined,
      { skipLoadingIndicator: true } as AxiosRequestConfig
    );
    return response.status;
  }

  async getInsightArtifactSqlPreviewTriggerResponse(
    dataMartId: string,
    insightArtifactId: string,
    triggerId: string
  ): Promise<InsightArtifactSqlPreviewResponseDto> {
    return this.get<InsightArtifactSqlPreviewResponseDto>(
      `/${dataMartId}/insight-artifacts/${insightArtifactId}/sql-preview-triggers/${triggerId}`,
      undefined,
      { skipLoadingIndicator: true } as AxiosRequestConfig
    );
  }

  async abortInsightArtifactSqlPreviewTrigger(
    dataMartId: string,
    insightArtifactId: string,
    triggerId: string
  ): Promise<void> {
    await this.delete(
      `/${dataMartId}/insight-artifacts/${insightArtifactId}/sql-preview-triggers/${triggerId}`,
      { skipLoadingIndicator: true } as AxiosRequestConfig
    );
  }
}

export const insightArtifactsService = new InsightArtifactsService();
