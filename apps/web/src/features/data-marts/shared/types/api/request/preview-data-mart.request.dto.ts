import type { FilterRule, SortRule } from '../../output-config';

export interface PreviewDataMartRequestDto {
  limit: number;
  filters?: FilterRule[];
  sort?: SortRule[];
}
