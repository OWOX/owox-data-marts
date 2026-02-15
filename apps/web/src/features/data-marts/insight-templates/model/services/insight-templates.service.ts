import { ApiService } from '../../../../../services';
import type {
  CreateInsightTemplateRequestDto,
  InsightTemplateExecutionStatusResponseDto,
  InsightTemplateListResponseDto,
  InsightTemplateResponseDto,
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
    id: string
  ): Promise<InsightTemplateResponseDto> {
    return this.get<InsightTemplateResponseDto>(`/${dataMartId}/insight-templates/${id}`);
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
    return this.delete(`/${dataMartId}/insight-templates/${id}`);
  }

  async startInsightTemplateExecution(
    dataMartId: string,
    insightTemplateId: string
  ): Promise<{ triggerId: string }> {
    return this.post<{ triggerId: string }>(
      `/${dataMartId}/insight-templates/${insightTemplateId}/run-triggers`,
      {}
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
      options
    );
  }
}

export const insightTemplatesService = new InsightTemplatesService();
