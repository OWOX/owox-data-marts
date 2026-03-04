import type { ApiError } from '../../../../../app/api';
import type { InsightEntity } from './insight.entity';
import { RequestStatus } from '../../../../../shared/types/request-status.ts';

export interface InsightsState {
  list: InsightEntity[];
  listLoadingStatus: RequestStatus;
  activeInsight: InsightEntity | null;
  activeInsightLoadingStatus: RequestStatus;
  executionStatus: RequestStatus;
  executionTriggerId: string | null;
  error: ApiError | null;
}

export const initialInsightsState: InsightsState = {
  list: [],
  listLoadingStatus: RequestStatus.IDLE,
  activeInsight: null,
  activeInsightLoadingStatus: RequestStatus.IDLE,
  executionStatus: RequestStatus.IDLE,
  executionTriggerId: null,
  error: null,
};
