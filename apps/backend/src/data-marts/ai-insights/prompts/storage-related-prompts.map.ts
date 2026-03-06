import { DataStorageType } from '../../data-storage-types/enums/data-storage-type.enum';
import { BIGQUERY_RELATED_PROMPTS } from './bigquery-related-prompt';
import { StorageRelatedPromptSection } from './storage-related-prompt.types';

export type StorageRelatedPromptsRegistry = Readonly<
  Record<StorageRelatedPromptSection, Partial<Record<DataStorageType, string>>>
>;

export const STORAGE_RELATED_PROMPTS: StorageRelatedPromptsRegistry = {
  [StorageRelatedPromptSection.PLAN_SYSTEM]: {
    [DataStorageType.GOOGLE_BIGQUERY]:
      BIGQUERY_RELATED_PROMPTS[StorageRelatedPromptSection.PLAN_SYSTEM],
  },
  [StorageRelatedPromptSection.SQL_BUILDER_SYSTEM]: {
    [DataStorageType.GOOGLE_BIGQUERY]:
      BIGQUERY_RELATED_PROMPTS[StorageRelatedPromptSection.SQL_BUILDER_SYSTEM],
  },
  [StorageRelatedPromptSection.QUERY_REPAIR_SYSTEM]: {
    [DataStorageType.GOOGLE_BIGQUERY]:
      BIGQUERY_RELATED_PROMPTS[StorageRelatedPromptSection.QUERY_REPAIR_SYSTEM],
  },
};
