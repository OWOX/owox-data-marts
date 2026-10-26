import type { DataStorageType } from './data-storage-type.enum.ts';
import type { ContextSummary } from '../../../../contexts/types/context.types';
import type { StorageCredentialSummary } from './data-storage.ts';

export interface DataStorageListItem {
  id: string;
  type: DataStorageType;
  title: string;
  createdAt: Date;
  modifiedAt: Date;
  publishedDataMartsCount: number;
  draftDataMartsCount: number;
  createdByUser?: import('../../../../../shared/types').UserProjection | null;
  ownerUsers?: import('../../../../../shared/types').UserProjection[];
  availableForUse?: boolean;
  availableForMaintenance?: boolean;
  contexts?: ContextSummary[];
  reusableCredential?: StorageCredentialSummary | null;
}
export type DataStorageList = DataStorageListItem[];
