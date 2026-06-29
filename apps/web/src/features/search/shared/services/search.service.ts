import { type AxiosRequestConfig } from 'axios';
import { ApiService } from '../../../../services';
import type { SearchResultResponseDto } from '../types';

export class SearchService extends ApiService {
  constructor() {
    super('');
  }

  async search(
    query: string,
    options?: {
      limit?: number;
      entityTypes?: SearchResultResponseDto['entityType'][];
      excludeDrafts?: boolean;
      config?: AxiosRequestConfig;
    }
  ): Promise<SearchResultResponseDto[]> {
    const { limit = 10, entityTypes, excludeDrafts, config } = options ?? {};
    const params: Record<string, unknown> = { q: query, limit };

    if (entityTypes?.length) {
      params.entityTypes = entityTypes.join(',');
    }

    if (excludeDrafts !== undefined) {
      params.excludeDrafts = excludeDrafts;
    }

    return this.get<SearchResultResponseDto[]>('/search', params, {
      ...config,
      skipLoadingIndicator: true,
      skipErrorToast: true,
    } as AxiosRequestConfig);
  }
}

export const searchService = new SearchService();
