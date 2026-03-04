import { ApiService } from '../../../../../services';
import type {
  CreateInsightRequestDto,
  CreateInsightResponseDto,
  InsightExecutionStatusResponseDto,
  InsightRunTriggersListResponseDto,
  InsightListResponseDto,
  InsightResponseDto,
  UpdateInsightRequestDto,
  UpdateInsightResponseDto,
  UpdateInsightTitleRequestDto,
  UpdateInsightTitleResponseDto,
} from '../types';

export class InsightsService extends ApiService {
  constructor() {
    super('/data-marts');
  }

  async getInsights(dataMartId: string): Promise<InsightListResponseDto> {
    return this.get<InsightListResponseDto>(`/${dataMartId}/insights`);
  }

  async getInsightById(dataMartId: string, id: string): Promise<InsightResponseDto> {
    return await this.get<InsightResponseDto>(`/${dataMartId}/insights/${id}`);
  }

  async createInsight(
    dataMartId: string,
    data: CreateInsightRequestDto
  ): Promise<CreateInsightResponseDto> {
    return this.post<CreateInsightResponseDto>(`/${dataMartId}/insights`, data);
  }

  async createInsightWithAi(dataMartId: string): Promise<CreateInsightResponseDto> {
    return this.post<CreateInsightResponseDto>(`/${dataMartId}/insights/ai-generate`, {});
  }

  async updateInsight(
    dataMartId: string,
    id: string,
    data: UpdateInsightRequestDto
  ): Promise<UpdateInsightResponseDto> {
    return this.put<UpdateInsightResponseDto>(`/${dataMartId}/insights/${id}`, data);
  }

  async updateInsightTitle(
    dataMartId: string,
    id: string,
    data: UpdateInsightTitleRequestDto
  ): Promise<UpdateInsightTitleResponseDto> {
    return this.put<UpdateInsightTitleResponseDto>(`/${dataMartId}/insights/${id}/title`, data);
  }

  async deleteInsight(dataMartId: string, id: string): Promise<void> {
    return this.delete(`/${dataMartId}/insights/${id}`);
  }

  async startInsightExecution(
    dataMartId: string,
    insightId: string
  ): Promise<{ triggerId: string }> {
    return this.post<{ triggerId: string }>(
      `/${dataMartId}/insights/${insightId}/run-triggers`,
      {}
    );
  }

  async checkInsightExecutionStatus(
    dataMartId: string,
    triggerId: string,
    insightId: string,
    options: { skipLoadingIndicator?: boolean; signal?: AbortSignal }
  ): Promise<InsightExecutionStatusResponseDto> {
    return this.get<InsightExecutionStatusResponseDto>(
      `/${dataMartId}/insights/${insightId}/run-triggers/${triggerId}/status`,
      null,
      options
    );
  }

  async getInsightRunTriggers(
    dataMartId: string,
    insightId: string,
    options?: { skipLoadingIndicator?: boolean; signal?: AbortSignal }
  ): Promise<InsightRunTriggersListResponseDto> {
    return this.get<InsightRunTriggersListResponseDto>(
      `/${dataMartId}/insights/${insightId}/run-triggers/`,
      null,
      options
    );
  }
}

export const insightsService = new InsightsService();
