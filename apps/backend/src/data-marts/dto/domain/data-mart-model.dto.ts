import type { Role } from '@owox/idp-protocol';
import type { DataMartStatus } from '../../enums/data-mart-status.enum';
import type { DataMartDefinitionType } from '../../enums/data-mart-definition-type.enum';

export interface DataMartModelPreviewRequest {
  projectId: string;
  userId: string;
  roles: Role[];
  dataMartId: string;
  limit?: number;
}

export interface DataMartModelPreviewDto {
  dataMartId: string;
  revision: number;
  observedModifiedAt: string;
  observedStatus: DataMartStatus;
  observedDefinitionType: DataMartDefinitionType | null;
  currentness: 'not-guaranteed' | 'changed-during-preview';
  schema: {
    freshness: 'current' | 'stale' | 'missing';
    inputRevision: number | null;
    actualizedAt: string | null;
  };
  columns: Array<{ name: string; alias?: string; type?: string }>;
  rows: Array<Array<string | number | boolean | null>>;
  rowCount: number;
  limit: number;
  truncated: boolean;
  payloadTruncated: boolean;
  warehouseChargesApply: true;
  warehouseTimeout: 'provider-dependent';
  reportRunCreated: false;
  owoxConsumptionRecorded: false;
}
