import type { Role } from '@owox/idp-protocol';
import type { RoleScope } from '../../enums/role-scope.enum';

export interface ContextSetupActor {
  projectId: string;
  userId: string;
  roles: Role[];
}

export type ContextResourceType = 'DATA_MART' | 'STORAGE' | 'DESTINATION' | 'CREDENTIAL';

export interface ContextResourceDto {
  id: string;
  type: ContextResourceType;
  title: string | null;
  contextIds: string[];
  canSetContexts: boolean;
  revision: number;
  revisionAggregate: 'project_context_configuration';
}

export interface ContextResourceQuery {
  contextId?: string;
  type?: ContextResourceType;
  query?: string;
  limit: number;
  offset: number;
}

export interface ContextSetupMemberDto {
  userId: string;
  email: string;
  displayName: string | null;
  role: string;
  administration: { roleScope: RoleScope; contextIds: string[]; revision: number } | null;
}

export interface ContextSetupDto {
  id: string;
  name: string;
  description: string | null;
  revision: number;
  revisionAggregate: 'project_context_configuration';
  actions: { canEdit: boolean; canManageMembers: boolean; canInspectImpact: boolean };
  resources: ContextResourceDto[];
  memberAssignments: ContextSetupMemberDto[] | null;
}

export interface ContextDefaultsDto {
  roleScope: RoleScope;
  contextIds: string[];
  revision: number;
  revisionAggregate: 'project_context_configuration';
  effect: 'new_members_only';
}

export interface ContextSetupImpactDto {
  impactDigest: string;
  contextId: string;
  revision: number;
  revisionAggregate: 'project_context_configuration';
  blockers: {
    dataMartCount: number;
    storageCount: number;
    destinationCount: number;
    credentialCount: number;
    memberCount: number;
    userProvisioningDefaultsCount: number;
  };
  affectedMemberIds: string[];
  detached: boolean;
  requiredActions: string[];
}
