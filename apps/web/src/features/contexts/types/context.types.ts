import type { UserProjection } from '../../../shared/types';
import type { DataMartIconValue } from '../../data-marts/shared/enums/data-mart-icon.enum';

export interface ContextDto {
  id: string;
  name: string;
  description: string | null;
  /** Picked icon (same values as a Data Mart icon); null draws the default one. */
  icon: DataMartIconValue | null;
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

/** A context as other resources (Data Marts, Storages, Destinations, Credentials) carry it. */
export interface ContextSummary {
  id: string;
  name: string;
  icon?: DataMartIconValue | null;
}
