import type { RoleScope } from '../../enums/role-scope.enum';
import type { ContextResourceType } from './mcp-context-setup.dto';

export type ContextChange =
  | { action: 'update_context'; contextId: string; name?: string; description?: string | null }
  | {
      action: 'set_entity_contexts';
      entityType: ContextResourceType;
      entityId: string;
      contextIds: string[];
    }
  | { action: 'set_context_members'; contextId: string; assignedUserIds: string[] }
  | {
      action: 'set_member_context_scope';
      memberId: string;
      roleScope: RoleScope;
      contextIds: string[];
    }
  | { action: 'set_context_defaults'; roleScope: RoleScope; contextIds: string[] }
  | { action: 'delete_context'; contextId: string };

export type ContextMutation =
  | { action: 'create_context'; name: string; description?: string; operationId: string }
  | (ContextChange & { expectedRevision: number; impactDigest: string; operationId?: string });

export interface ContextMutationResult {
  resourceId: string;
  revision: number;
  revisionAggregate: 'project_context_configuration';
  deleted?: boolean;
  state: 'completed' | 'incomplete' | 'unknown';
}

export interface ContextChangeEffects {
  defaultRole: string | null;
  currentContextIds: string[];
  proposedContextIds: string[];
  currentMemberIds: string[];
  proposedMemberIds: string[];
  affectedMemberIds: string[];
  currentScope: RoleScope | null;
  proposedScope: RoleScope | null;
  blockers: {
    dataMartCount: number;
    storageCount: number;
    destinationCount: number;
    credentialCount: number;
    memberCount: number;
    userProvisioningDefaultsCount: number;
  };
}
export interface ContextChangeImpact {
  revision: number;
  revisionAggregate: 'project_context_configuration';
  action: string;
  target: string;
  impactDigest: string;
  change: ContextChange;
  effects: ContextChangeEffects;
}
