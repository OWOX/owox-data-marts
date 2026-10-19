import type { DataMartModelPreviewRequest } from './data-mart-model.dto';
import type { DataMartSchemaUpdate } from '../../data-storage-types/data-mart-schema.type';
import type { BlendedFieldsConfig } from '../schemas/blended-fields-config.schema';
import type { JoinCondition } from '../schemas/join-condition.schema';

export interface DataMartModelMutationRequest extends DataMartModelPreviewRequest {
  expectedRevision: number;
}
export interface DataMartModelSchemaRequest extends DataMartModelMutationRequest {
  schema: DataMartSchemaUpdate;
}
export type DataMartRelationshipChange =
  | {
      action: 'create';
      targetDataMartId: string;
      targetAlias: string;
      joinConditions: JoinCondition[];
      description?: string;
    }
  | {
      action: 'update';
      relationshipId: string;
      targetAlias?: string;
      joinConditions?: JoinCondition[];
      description?: string | null;
    }
  | { action: 'remove'; relationshipId: string };
export interface DataMartModelRelationshipsRequest extends DataMartModelMutationRequest {
  changes: DataMartRelationshipChange[];
  blendedFieldsConfig?: BlendedFieldsConfig | null;
}
export interface DataMartModelAccessRequest extends DataMartModelMutationRequest {
  mode: 'inspect' | 'apply';
  owners?: { businessOwnerIds: string[]; technicalOwnerIds: string[] };
  availability?: { availableForReporting: boolean; availableForMaintenance: boolean };
  impactDigest?: string;
}
export interface DataMartModelAudienceDto {
  businessOwnerIds: string[];
  technicalOwnerIds: string[];
  contextIds: string[];
  availableForReporting: boolean;
  availableForMaintenance: boolean;
}
export interface DataMartModelMutationDto {
  state: 'completed' | 'inspection';
  dataMartId: string;
  revision: number;
  schema?: { inputRevision: number | null; freshness: 'current' | 'stale' | 'missing' };
  warnings?: Array<{ code: string; message: string; field: string; subject?: string }>;
  impactDigest?: string;
  currentAudience?: DataMartModelAudienceDto;
  proposedAudience?: DataMartModelAudienceDto;
}
