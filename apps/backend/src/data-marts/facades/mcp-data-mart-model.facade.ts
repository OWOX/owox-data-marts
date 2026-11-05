import type { AuthorizationContext } from '../../idp';
import type { DataMartStatus } from '../enums/data-mart-status.enum';
import type { DataMartPreviewResult } from '../use-cases/preview-data-mart.service';

export { ALIAS_SEGMENT_REGEX } from '../dto/schemas/blended-fields-config.schema';
export const MCP_DATA_MART_MODEL_FACADE = Symbol('MCP_DATA_MART_MODEL_FACADE');
export const MCP_MODEL_PREVIEW_DEFAULT_LIMIT = 20;
export const MCP_MODEL_PREVIEW_MAX_LIMIT = 100;

export interface McpRelationshipJoinCondition {
  sourceFieldName: string;
  targetFieldName: string;
}

export interface McpRelationshipDataMartDto {
  id: string;
  userHasAccess: boolean;
  title?: string;
  description?: string;
  status?: DataMartStatus;
  hasPrimaryKey?: boolean;
}

export interface McpRelationshipDto {
  id: string;
  dataStorageId: string;
  sourceDataMart: McpRelationshipDataMartDto;
  targetDataMart: McpRelationshipDataMartDto;
  targetAlias: string;
  joinConditions: McpRelationshipJoinCondition[];
  description?: string;
  createdAt: string;
  modifiedAt: string;
}

export interface McpRelationshipGraphDto {
  rootDataMartId: string;
  nodes: Array<{
    relationship: McpRelationshipDto;
    aliasPath: string;
    depth: number;
    isCycleStub: boolean;
    isBlocked: boolean;
  }>;
}

export interface McpCreateRelationshipInput {
  dataMartId: string;
  targetDataMartId: string;
  targetAlias: string;
  joinConditions: McpRelationshipJoinCondition[];
  description?: string;
}

export interface McpUpdateRelationshipInput {
  dataMartId: string;
  relationshipId: string;
  targetAlias?: string;
  joinConditions?: McpRelationshipJoinCondition[];
  description?: string | null;
}

export interface McpDataMartModelFacade {
  listRelationships(
    actor: AuthorizationContext,
    dataMartId: string
  ): Promise<McpRelationshipGraphDto>;
  createRelationship(
    actor: AuthorizationContext,
    input: McpCreateRelationshipInput
  ): Promise<McpRelationshipDto>;
  updateRelationship(
    actor: AuthorizationContext,
    input: McpUpdateRelationshipInput
  ): Promise<McpRelationshipDto>;
  deleteRelationship(
    actor: AuthorizationContext,
    dataMartId: string,
    relationshipId: string
  ): Promise<void>;
  preview(
    actor: AuthorizationContext,
    dataMartId: string,
    limit?: number,
    signal?: AbortSignal
  ): Promise<DataMartPreviewResult>;
}
