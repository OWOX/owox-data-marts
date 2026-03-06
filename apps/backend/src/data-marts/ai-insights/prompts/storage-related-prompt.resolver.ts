import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../data-storage-types/enums/data-storage-type.enum';
import { StorageRelatedPromptSection } from './storage-related-prompt.types';
import {
  STORAGE_RELATED_PROMPTS,
  StorageRelatedPromptsRegistry,
} from './storage-related-prompts.map';

@Injectable()
export class StorageRelatedPromptResolver {
  private readonly promptsRegistry: StorageRelatedPromptsRegistry = STORAGE_RELATED_PROMPTS;

  resolve(
    section: StorageRelatedPromptSection,
    storageType?: DataStorageType | null
  ): string | null {
    const normalizedStorageType = this.normalizeStorageType(storageType);
    if (!normalizedStorageType) {
      return null;
    }

    return this.promptsRegistry[section][normalizedStorageType] ?? null;
  }

  private normalizeStorageType(storageType?: DataStorageType | null): DataStorageType | null {
    if (!storageType) {
      return null;
    }

    if (storageType === DataStorageType.LEGACY_GOOGLE_BIGQUERY) {
      return DataStorageType.GOOGLE_BIGQUERY;
    }

    return storageType;
  }
}
