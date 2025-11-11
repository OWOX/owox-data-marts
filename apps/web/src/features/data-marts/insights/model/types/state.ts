import type { ApiError } from '../../../../../app/api';
import type { InsightEntity } from './insight.entity';

export interface InsightsState {
  insights: InsightEntity[];
  loading: boolean;
  error: ApiError | null;
}

export const initialInsightsState: InsightsState = {
  insights: [],
  loading: false,
  error: null,
};
