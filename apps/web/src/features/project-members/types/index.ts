import type { Role } from '../../idp/types';

export type { Role };

export const PROJECT_ROLE_VALUES = ['admin', 'editor', 'viewer'] as const satisfies readonly Role[];

export const ROLE_SCOPE_VALUES = ['entire_project', 'selected_contexts'] as const;
export type RoleScope = (typeof ROLE_SCOPE_VALUES)[number];

export interface MembershipRequestDto {
  requestId: string;
  email: string;
  fullName?: string;
  avatar?: string;
  userId?: string;
  requestedRole: Role;
  createdAt: string;
}

export interface ApproveMembershipRequestPayload {
  role: Role;
  roleScope?: RoleScope;
  contextIds?: string[];
}

export interface ApproveMembershipRequestResult {
  userId: string;
  role: Role;
  roleScope: RoleScope;
  contextIds: string[];
}

export type UserProvisioningMode = 'automatic' | 'manual';

export interface UserProvisioningOrganization {
  name: string;
  mainProjectId?: string | null;
  mainProjectTitle?: string | null;
}

export interface UserProvisioningSettingsValue {
  mode: UserProvisioningMode;
  defaultRole: Role;
  roleScope: RoleScope;
  contextIds: string[];
}

export interface UserProvisioningSettingsResponse {
  isApplicable: boolean;
  isMainProject: boolean;
  organization: UserProvisioningOrganization | null;
  settings: UserProvisioningSettingsValue | null;
}

export type UpdateUserProvisioningSettingsPayload = UserProvisioningSettingsValue;
