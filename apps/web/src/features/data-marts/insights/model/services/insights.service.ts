import { ApiService } from '../../../../../services';
import type {
  CreateInsightRequestDto,
  CreateInsightResponseDto,
  InsightListResponseDto,
  InsightResponseDto,
  UpdateInsightRequestDto,
  UpdateInsightResponseDto,
} from '../types';

export class InsightsService extends ApiService {
  constructor() {
    super('/data-marts');
  }

  async getInsights(dataMartId: string): Promise<InsightListResponseDto> {
    return this.get<InsightListResponseDto>(`/${dataMartId}/insights`);
  }

  async getInsightById(dataMartId: string, id: string): Promise<InsightResponseDto> {
    return this.get<InsightResponseDto>(`/${dataMartId}/insights/${id}`);
  }

  async createInsight(
    dataMartId: string,
    data: CreateInsightRequestDto
  ): Promise<CreateInsightResponseDto> {
    return this.post<CreateInsightResponseDto>(`/${dataMartId}/insights`, data);
  }

  async updateInsight(
    dataMartId: string,
    id: string,
    data: UpdateInsightRequestDto
  ): Promise<UpdateInsightResponseDto> {
    return this.put<UpdateInsightResponseDto>(`/${dataMartId}/insights/${id}`, data);
  }

  async deleteInsight(dataMartId: string, id: string): Promise<void> {
    return this.delete(`/${dataMartId}/insights/${id}`);
  }
}

export const insightsService = new InsightsService();
