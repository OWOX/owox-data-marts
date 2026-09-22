import type { FilterRule } from '../../output-config';

export interface PreviewDataMartRequestDto {
  limit: number;
  filters?: FilterRule[];
}
