import type {
  DataMartSetupDefinitionInput,
  DataMartSetupCreateRequest,
  DataMartSetupDefinitionRequest,
  DataMartSetupMetadataRequest,
  DataMartSetupPublishRequest,
  DataMartSetupDeleteRequest,
  DataMartSetupMutationDto,
} from '../dto/domain/data-mart-setup-mutation.dto';
import type { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import type { DataMartStatus } from '../enums/data-mart-status.enum';

export { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
export { DataMartStatus } from '../enums/data-mart-status.enum';

export const MCP_DATA_MART_SETUP_FACADE = Symbol('MCP_DATA_MART_SETUP_FACADE');
export interface DataMartSetupActor {
  projectId: string;
  userId: string;
  roles: string[];
}
export interface DataMartSetupRequest extends DataMartSetupActor {
  dataMartId: string;
}
export interface DataMartSetupListRequest extends DataMartSetupActor {
  limit: number;
  offset?: number;
  status?: DataMartStatus;
}
export interface DataMartSetupValidationRequest extends DataMartSetupRequest {
  mode: 'static' | 'live';
}
export interface DataMartSetupImpactRequest extends DataMartSetupRequest {
  action: 'definition' | 'delete';
  nextDefinitionType?: DataMartDefinitionType;
  definition?: DataMartSetupDefinitionInput;
}
export type DataMartSetupDefinitionDto =
  | { type: 'SQL'; sqlQuery: string }
  | { type: 'TABLE' | 'VIEW'; fullyQualifiedName: string }
  | { type: 'TABLE_PATTERN'; pattern: string }
  | {
      type: 'CONNECTOR';
      connectorName: string;
      node: string;
      fields: string[];
      version: number | null;
      fullyQualifiedName: string;
      configurationCount: number;
      configuration: 'app-managed';
    };
export interface DataMartSetupSummaryDto {
  id: string;
  title: string;
  description: string | null;
  icon: string | null;
  status: DataMartStatus;
  definitionType: DataMartDefinitionType | null;
  revision: number;
  modifiedAt: string;
  appUrl: string;
}
export interface DataMartSetupRelationshipDto {
  id: string;
  sourceDataMartId: string;
  targetDataMartId: string;
  joinConditions: Array<{ sourceFieldName: string; targetFieldName: string }>;
}
export interface DataMartSetupScheduleDto {
  id: string;
  type: string;
  enabled: boolean;
  cronExpression: string;
  timeZone: string;
}
export interface DataMartSetupDto extends DataMartSetupSummaryDto {
  storage: { id: string; type: string };
  connectorPreparationId: string | null;
  definition: DataMartSetupDefinitionDto | null;
  schema: {
    freshness: 'missing' | 'current' | 'stale';
    inputRevision: number | null;
    actualizedAt: string | null;
  };
  access: {
    availableForReporting: boolean;
    availableForMaintenance: boolean;
    technicalOwnerIds: string[];
    businessOwnerIds: string[];
    contextIds: string[];
    canEdit: boolean;
    canDelete: boolean;
    canConfigureSharing: boolean;
    canManageOwners: boolean;
  };
  relationships: DataMartSetupRelationshipDto[];
  restrictedDependencies: boolean;
  schedules: DataMartSetupScheduleDto[];
  reportsCount: number;
}
export interface DataMartSetupValidationDto {
  dataMartId: string;
  mode: 'static' | 'live';
  valid: boolean;
  code: string | null;
  revision: number;
  evaluatedModifiedAt: string;
  currentness: 'current' | 'changed-during-validation';
}
export interface DataMartSetupImpactDto {
  dataMartId: string;
  action: 'definition' | 'delete';
  nextDefinitionType: DataMartDefinitionType | null;
  revision: number;
  activeConnectorRunsCount: number;
  queuedConnectorWorkCount: number;
  confirmation: 'impact-digest';
  impactDigest: string;
  schemaEffect: 'removed-with-data-mart' | 'requires-actualization';
  credentialEffect: 'handover-in-use-and-delete-unreferenced' | 'unchanged';
  reportEffect: 'delete-and-invalidate-cache' | 'may-require-repair';
  scheduleEffect: 'delete' | 'retained';
  relationships: DataMartSetupRelationshipDto[];
  restrictedDependencies: boolean;
  reportsCount: number;
  schedules: DataMartSetupScheduleDto[];
  audience: {
    availableForReporting: boolean;
    availableForMaintenance: boolean;
    contextIds: string[];
  };
  legacyExternalDeletion: boolean;
  dropsWarehouseTables: false;
}
export interface McpDataMartSetupFacade {
  create(request: DataMartSetupCreateRequest): Promise<DataMartSetupMutationDto>;
  updateDefinition(request: DataMartSetupDefinitionRequest): Promise<DataMartSetupMutationDto>;
  updateMetadata(request: DataMartSetupMetadataRequest): Promise<DataMartSetupMutationDto>;
  publish(request: DataMartSetupPublishRequest): Promise<DataMartSetupMutationDto>;
  delete(request: DataMartSetupDeleteRequest): Promise<DataMartSetupMutationDto>;
  list(
    request: DataMartSetupListRequest
  ): Promise<{ items: DataMartSetupSummaryDto[]; hasMore: boolean }>;
  get(request: DataMartSetupRequest): Promise<DataMartSetupDto>;
  validate(request: DataMartSetupValidationRequest): Promise<DataMartSetupValidationDto>;
  impact(request: DataMartSetupImpactRequest): Promise<DataMartSetupImpactDto>;
}
