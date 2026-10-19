import type {
  DataMartSetupActor,
  DataMartSetupRequest,
} from '../../facades/mcp-data-mart-setup.facade';
import type { DataMartIconValue } from '../../enums/data-mart-icon.enum';

/** Secret-bearing Connector configuration is selected in the authenticated application. */
export type DataMartSetupDefinitionInput =
  | { type: 'SQL'; sqlQuery: string }
  | { type: 'TABLE' | 'VIEW'; fullyQualifiedName: string }
  | { type: 'TABLE_PATTERN'; pattern: string }
  | {
      type: 'CONNECTOR';
      connectorName: string;
      node: string;
      fields: string[];
      version?: number;
      fullyQualifiedName: string;
      preparationId?: string;
      parameters?: Record<string, string | number | boolean | null>;
    };
export interface DataMartSetupCreateRequest extends DataMartSetupActor {
  storageId: string;
  title: string;
  icon?: DataMartIconValue | null;
  operationId: string;
}
export interface DataMartSetupDefinitionRequest extends DataMartSetupRequest {
  expectedRevision: number;
  definition: DataMartSetupDefinitionInput;
  impactDigest?: string;
  operationId: string;
}
export interface DataMartSetupMetadataRequest extends DataMartSetupRequest {
  expectedRevision: number;
  title?: string;
  description?: string | null;
  icon?: DataMartIconValue | null;
  operationId: string;
}
export interface DataMartSetupPublishRequest extends DataMartSetupRequest {
  expectedRevision: number;
  operationId: string;
}
export interface DataMartSetupDeleteRequest extends DataMartSetupPublishRequest {
  impactDigest: string;
}
export interface DataMartSetupMutationDto {
  state: 'completed' | 'incomplete' | 'unknown' | 'app_action_required';
  resourceId: string;
  revision?: number;
  runId?: string;
  triggerId?: string;
  deleted?: boolean;
  publicationState?: 'PUBLISHED';
  audience?: {
    configurationRevision: number;
    availableForReporting: boolean;
    availableForMaintenance: boolean;
    contextIds: string[];
  };
  dataReady?: boolean;
  appUrl?: string;
  nextStep?: string;
  externalState?: 'completed' | 'unknown';
}
