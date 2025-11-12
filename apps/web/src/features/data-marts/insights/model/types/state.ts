import type { ApiError } from '../../../../../app/api';
import type { InsightEntity } from './insight.entity';

export interface InsightsState {
  insights: InsightEntity[];
  currentInsight: InsightEntity | null;
  loading: boolean;
  currentLoading: boolean;
  error: ApiError | null;
}

export const initialInsightsState: InsightsState = {
  insights: [],
  currentInsight: null,
  loading: false,
  currentLoading: false,
  error: null,
};
