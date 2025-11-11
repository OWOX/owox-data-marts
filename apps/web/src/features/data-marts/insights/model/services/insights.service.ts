import { ApiService } from '../../../../../services';
import type {
  CreateInsightRequestDto,
  CreateInsightResponseDto,
  InsightListResponseDto,
  InsightResponseDto,
  UpdateInsightRequestDto,
  UpdateInsightResponseDto,
} from '../types';
import { mockInsightsListDto } from './insights.mock';

const MOCK_INSIGHTS_ENABLED = Boolean(import.meta.env.VITE_MOCK_INSIGHTS);

export class InsightsService extends ApiService {
  constructor() {
    super('/data-marts');
  }

  async getInsights(dataMartId: string): Promise<InsightListResponseDto> {
    console.log(MOCK_INSIGHTS_ENABLED);
    if (MOCK_INSIGHTS_ENABLED) {
      // Temporary mock for Insights list until backend API is available
      return Promise.resolve(mockInsightsListDto);
    }
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
