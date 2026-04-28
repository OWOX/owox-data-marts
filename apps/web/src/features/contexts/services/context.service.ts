import { ApiService } from '../../../services/api-service';
import type { ContextDto, ContextImpactDto } from '../types/context.types';

class ContextApiService extends ApiService {
  constructor() {
    super('/contexts');
  }

  async getContexts(): Promise<ContextDto[]> {
    return this.get<ContextDto[]>('');
  }

  async createContext(data: { name: string; description?: string }): Promise<ContextDto> {
    return this.post<ContextDto>('', data);
  }

  async updateContext(
    id: string,
    data: { name: string; description?: string }
  ): Promise<ContextDto> {
    return this.put<ContextDto>(`/${id}`, data);
  }

  async getContextImpact(id: string): Promise<ContextImpactDto> {
    return this.get<ContextImpactDto>(`/${id}/impact`);
  }

  async deleteContext(id: string): Promise<void> {
    return this.delete(`/${id}`);
  }

  /**
   * Atomic context-membership edit: the backend diffs `assignedUserIds` against
   * the current state and only touches `member_role_contexts` rows for this one
   * context. Admin ids are silently ignored on the server.
   */
  async updateContextMembers(contextId: string, assignedUserIds: string[]): Promise<void> {
    return this.put(`/${contextId}/members`, { assignedUserIds });
  }
}

export const contextService = new ContextApiService();
