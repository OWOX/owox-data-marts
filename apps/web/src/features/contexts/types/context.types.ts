import type { UserProjection } from '../../../shared/types';

export interface ContextDto {
  id: string;
  name: string;
  description: string | null;
  createdById: string | null;
  createdByUser: UserProjection | null;
  createdAt: string;
  modifiedAt: string;
}

export interface ContextImpactDto {
  contextId: string;
  contextName: string;
  dataMartCount: number;
  storageCount: number;
  destinationCount: number;
  memberCount: number;
  userProvisioningDefaultsCount: number;
  affectedMemberIds: string[];
}

import type { Role, RoleScope } from '../../project-members/types';

export interface MemberWithScopeDto {
  userId: string;
  email: string;
  displayName: string | undefined;
  avatarUrl: string | undefined;
  role: Role;
  roleScope: RoleScope;
  contextIds: string[];
}

export interface ContextSummary {
  id: string;
  name: string;
}
