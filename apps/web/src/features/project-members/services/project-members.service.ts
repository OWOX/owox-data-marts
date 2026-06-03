import { ApiService } from '../../../services/api-service';
import type { MemberWithScopeDto } from '../../contexts/types/context.types';
import type {
  ApproveMembershipRequestPayload,
  ApproveMembershipRequestResult,
  MembershipRequestDto,
  Role,
  RoleScope,
  UpdateUserProvisioningSettingsPayload,
  UserProvisioningSettingsResponse,
} from '../types';

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
      role: Role;
      kind: 'email-sent';
      userId?: string;
      message?: string;
    }
  | {
      email: string;
      role: Role;
      kind: 'magic-link';
      magicLink: string;
      userId?: string;
      expiresAt?: string;
      message?: string;
    };

export interface UpdateMemberPayload {
  role: Role;
  roleScope: RoleScope;
  contextIds: string[];
}

export interface UpdateMemberResult {
  userId: string;
  role: Role;
  roleScope: RoleScope;
  contextIds: string[];
  roleStatus: 'ok' | 'pending';
  message?: string;
}

export interface InviteMemberPayload {
  email: string;
  role: Role;
  roleScope?: RoleScope;
  contextIds?: string[];
}

class ProjectMembersApiService extends ApiService {
  constructor() {
    super('/members');
  }

  async getMembers(): Promise<MemberWithScopeDto[]> {
    return this.get<MemberWithScopeDto[]>('/');
  }

  async updateMember(userId: string, payload: UpdateMemberPayload): Promise<UpdateMemberResult> {
    return this.put(`/${userId}`, payload);
  }

  async inviteMember(payload: InviteMemberPayload): Promise<InviteMemberResponse> {
    return this.post('/invite', payload);
  }

  async removeMember(userId: string): Promise<void> {
    return this.delete(`/${userId}`);
  }

  async getMembershipRequests(): Promise<MembershipRequestDto[]> {
    return this.get<MembershipRequestDto[]>('/requests');
  }

  async approveMembershipRequest(
    requestId: string,
    payload: ApproveMembershipRequestPayload
  ): Promise<ApproveMembershipRequestResult> {
    return this.post(`/requests/${requestId}/approve`, payload);
  }

  async declineMembershipRequest(requestId: string): Promise<void> {
    return this.post(`/requests/${requestId}/decline`, {});
  }

  async getUserProvisioningSettings(): Promise<UserProvisioningSettingsResponse> {
    return this.get<UserProvisioningSettingsResponse>('/user-provisioning-settings');
  }

  async updateUserProvisioningSettings(
    payload: UpdateUserProvisioningSettingsPayload
  ): Promise<UserProvisioningSettingsResponse> {
    return this.put<UserProvisioningSettingsResponse>('/user-provisioning-settings', payload);
  }
}

export const projectMembersService = new ProjectMembersApiService();
