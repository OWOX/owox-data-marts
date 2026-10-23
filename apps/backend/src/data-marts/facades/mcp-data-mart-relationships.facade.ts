import type { Role } from '@owox/idp-protocol';
import type { DataMartStatus } from '../enums/data-mart-status.enum';

export { ALIAS_SEGMENT_REGEX as MCP_DATA_MART_RELATIONSHIP_ALIAS_REGEX } from '../dto/schemas/blended-fields-config.schema';

export const MCP_DATA_MART_RELATIONSHIPS_FACADE = Symbol('MCP_DATA_MART_RELATIONSHIPS_FACADE');

export interface McpDataMartRelationshipActor {
  projectId: string;
  userId: string;
  roles: Role[];
}

export interface McpDataMartRelationshipJoinCondition {
  sourceFieldName: string;
  targetFieldName: string;
}

export interface McpCreateDataMartRelationshipRequest extends McpDataMartRelationshipActor {
  dataMartId: string;
  targetDataMartId: string;
  targetAlias: string;
  joinConditions: McpDataMartRelationshipJoinCondition[];
  description?: string;
}

export interface McpUpdateDataMartRelationshipRequest extends McpDataMartRelationshipActor {
  dataMartId: string;
  relationshipId: string;
  targetAlias?: string;
  joinConditions?: McpDataMartRelationshipJoinCondition[];
  description?: string | null;
}

export interface McpDeleteDataMartRelationshipRequest extends McpDataMartRelationshipActor {
  dataMartId: string;
  relationshipId: string;
}

export interface McpGetDataMartRelationshipGraphRequest extends McpDataMartRelationshipActor {
  dataMartId: string;
}

export interface McpDataMartRelationshipRef {
  id: string;
  userHasAccess: boolean;
  title?: string;
  description?: string;
  status?: DataMartStatus;
  hasPrimaryKey?: boolean;
}

export interface McpDataMartRelationshipUser {
  userId: string;
  fullName?: string | null;
  email?: string | null;
  avatar?: string | null;
}

export interface McpDataMartRelationshipDto {
  id: string;
  dataStorageId: string;
  sourceDataMart: McpDataMartRelationshipRef;
  targetDataMart: McpDataMartRelationshipRef;
  targetAlias: string;
  joinConditions: McpDataMartRelationshipJoinCondition[];
  description?: string;
  createdById: string;
  createdAt: string;
  modifiedAt: string;
  createdByUser: McpDataMartRelationshipUser | null;
}

export interface McpDataMartRelationshipGraphNode {
  relationship: McpDataMartRelationshipDto;
  aliasPath: string;
  depth: number;
  isCycleStub: boolean;
  isBlocked: boolean;
}

export interface McpDataMartRelationshipGraphDto {
  rootDataMartId: string;
  nodes: McpDataMartRelationshipGraphNode[];
}

export interface McpDataMartRelationshipsFacade {
  createRelationship(
    request: McpCreateDataMartRelationshipRequest
  ): Promise<McpDataMartRelationshipDto>;
  updateRelationship(
    request: McpUpdateDataMartRelationshipRequest
  ): Promise<McpDataMartRelationshipDto>;
  deleteRelationship(request: McpDeleteDataMartRelationshipRequest): Promise<void>;
  getRelationshipGraph(
    request: McpGetDataMartRelationshipGraphRequest
  ): Promise<McpDataMartRelationshipGraphDto>;
}
