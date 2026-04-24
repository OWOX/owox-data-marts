import { ApiService } from '../../../services/api-service';
import type { ContextDto, ContextImpactDto, MemberWithScopeDto } from '../types/context.types';

/**
 * Discriminated union mirroring `InviteMemberResponseApiDto` from backend.
 *
 * `email-sent` — backend IDP (e.g. owox-better-auth) delivered the invitation
 * email itself; UI confirms with a toast.
 *
 * `magic-link` — backend IDP (e.g. better-auth) returned a link that the admin
 * must copy and share out-of-band; UI shows the link with a copy button.
 */
export type InviteMemberResponse =
  | {
      email: string;
      role: string;
      kind: 'email-sent';
      userId?: string;
      message?: string;
    }
  | {
      email: string;
      role: string;
      kind: 'magic-link';
      magicLink: string;
      userId?: string;
      expiresAt?: string;
      message?: string;
    };

class ContextApiService extends ApiService {
  constructor() {
    super('/contexts');
  }

  async getContexts(): Promise<ContextDto[]> {
    return this.get<ContextDto[]>('/');
  }

  async createContext(data: { name: string; description?: string }): Promise<ContextDto> {
    return this.post<ContextDto>('', data);
  }

  async updateContext(
    id: string,
    data: { name: string; description: string }
  ): Promise<ContextDto> {
    return this.put<ContextDto>(`/${id}`, data);
  }

  async getContextImpact(id: string): Promise<ContextImpactDto> {
    return this.get<ContextImpactDto>(`/${id}/impact`);
  }

  async deleteContext(id: string): Promise<void> {
    return this.delete(`/${id}`);
  }

  async updateDataMartContexts(dataMartId: string, contextIds: string[]): Promise<void> {
    return this.put(`/data-marts/${dataMartId}/contexts`, { contextIds });
  }

  /**
   * Atomic context-membership edit: the backend diffs `assignedUserIds` against
   * the current state and only touches `member_role_contexts` rows for this one
   * context. Admin ids are silently ignored on the server.
   */
  async updateContextMembers(contextId: string, assignedUserIds: string[]): Promise<void> {
    return this.put(`/${contextId}/members`, { assignedUserIds });
  }

  async getMembers(): Promise<MemberWithScopeDto[]> {
    return this.get<MemberWithScopeDto[]>('/members');
  }

  async updateMember(
    userId: string,
    payload: {
      role: string;
      roleScope: string;
      contextIds: string[];
    }
  ): Promise<{
    userId: string;
    role: string;
    roleScope: string;
    contextIds: string[];
    roleStatus: 'ok' | 'pending';
    message?: string;
  }> {
    return this.put(`/members/${userId}`, payload);
  }

  async inviteMember(payload: {
    email: string;
    role: string;
    roleScope?: 'entire_project' | 'selected_contexts';
    contextIds?: string[];
  }): Promise<InviteMemberResponse> {
    return this.post('/members/invite', payload);
  }

  async removeMember(userId: string): Promise<void> {
    return this.delete(`/members/${userId}`);
  }
}

export const contextService = new ContextApiService();
