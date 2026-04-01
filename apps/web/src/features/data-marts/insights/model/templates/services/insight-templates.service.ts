import { ApiService } from '../../../../../../services';
import type { AxiosRequestConfig } from 'axios';
import type {
  CreateInsightTemplateRequestDto,
  InsightTemplateExecutionStatusResponseDto,
  InsightTemplateListResponseDto,
  InsightTemplateResponseDto,
  InsightTemplateRunTriggersListResponseDto,
  StartInsightTemplateExecutionRequestDto,
  UpdateInsightTemplateRequestDto,
} from '../types/insight-templates.dto';

export class InsightTemplatesService extends ApiService {
  constructor() {
    super('/data-marts');
  }

  async getInsightTemplates(dataMartId: string): Promise<InsightTemplateListResponseDto> {
    return this.get<InsightTemplateListResponseDto>(`/${dataMartId}/insight-templates`);
  }

  async getInsightTemplateById(
    dataMartId: string,
    id: string,
    options?: { skipLoadingIndicator?: boolean; signal?: AbortSignal }
  ): Promise<InsightTemplateResponseDto> {
    return this.get<InsightTemplateResponseDto>(
      `/${dataMartId}/insight-templates/${id}`,
      null,
      options as AxiosRequestConfig
    );
  }

  async createInsightTemplate(
    dataMartId: string,
    data: CreateInsightTemplateRequestDto
  ): Promise<InsightTemplateResponseDto> {
    return this.post<InsightTemplateResponseDto>(`/${dataMartId}/insight-templates`, data);
  }

  async updateInsightTemplate(
    dataMartId: string,
    id: string,
    data: UpdateInsightTemplateRequestDto
  ): Promise<InsightTemplateResponseDto> {
    return this.put<InsightTemplateResponseDto>(`/${dataMartId}/insight-templates/${id}`, data);
  }

  async updateInsightTemplateTitle(
    dataMartId: string,
    id: string,
    title: string
  ): Promise<InsightTemplateResponseDto> {
    return this.put<InsightTemplateResponseDto>(`/${dataMartId}/insight-templates/${id}/title`, {
      title,
    });
  }

  async deleteInsightTemplate(dataMartId: string, id: string): Promise<void> {
    await this.delete(`/${dataMartId}/insight-templates/${id}`);
  }

  async startInsightTemplateExecution(
    dataMartId: string,
    insightTemplateId: string,
    data: StartInsightTemplateExecutionRequestDto
  ): Promise<{ triggerId: string }> {
    return this.post<{ triggerId: string }>(
      `/${dataMartId}/insight-templates/${insightTemplateId}/run-triggers`,
      data
    );
  }

  async checkInsightTemplateExecutionStatus(
    dataMartId: string,
    triggerId: string,
    insightTemplateId: string,
    options?: { skipLoadingIndicator?: boolean; signal?: AbortSignal }
  ): Promise<InsightTemplateExecutionStatusResponseDto> {
    return this.get<InsightTemplateExecutionStatusResponseDto>(
      `/${dataMartId}/insight-templates/${insightTemplateId}/run-triggers/${triggerId}/status`,
      null,
      options as AxiosRequestConfig
    );
  }

  async abortInsightTemplateExecution(
    dataMartId: string,
    insightTemplateId: string,
    triggerId: string
  ): Promise<void> {
    await this.delete(
      `/${dataMartId}/insight-templates/${insightTemplateId}/run-triggers/${triggerId}`,
      { skipLoadingIndicator: true } as AxiosRequestConfig
    );
  }

  async getInsightTemplateRunTriggers(
    dataMartId: string,
    insightTemplateId: string,
    options?: { skipLoadingIndicator?: boolean; signal?: AbortSignal }
  ): Promise<InsightTemplateRunTriggersListResponseDto> {
    return this.get<InsightTemplateRunTriggersListResponseDto>(
      `/${dataMartId}/insight-templates/${insightTemplateId}/run-triggers/`,
      null,
      options as AxiosRequestConfig
    );
  }
}

export const insightTemplatesService = new InsightTemplatesService();
