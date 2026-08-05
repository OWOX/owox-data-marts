import { Injectable } from '@nestjs/common';
import { PLUGIN_COLLECTION_LIMITS } from '../constants/plugin-collection-limits';
import type { JsonValue } from '../dto/domain/plugin-collection.types';
import type { PluginCollectionUsage } from '../entities/plugin-collection-usage.collection.entity';
import { PluginCollectionQuotaExceededError } from '../errors/plugin-collection.errors';

@Injectable()
export class PluginCollectionQuotaService {
  documentSize(document: JsonValue): number {
    const bytes = Buffer.byteLength(JSON.stringify(document), 'utf8');
    if (bytes > PLUGIN_COLLECTION_LIMITS.maxDocumentBytes) {
      throw new PluginCollectionQuotaExceededError('document is larger than 1 MiB');
    }
    return bytes;
  }

  assertUsage(rows: readonly PluginCollectionUsage[], byteDelta: number, countDelta: number): void {
    for (const row of rows) {
      const nextBytes = Number(row.totalBytes) + byteDelta;
      const nextCount = row.documentCount + countDelta;
      if (row.level === 'namespace') {
        if (nextCount > PLUGIN_COLLECTION_LIMITS.maxDocumentsPerNamespace) {
          throw new PluginCollectionQuotaExceededError('10,000 documents per collection');
        }
        if (nextBytes > PLUGIN_COLLECTION_LIMITS.maxBytesPerNamespace) {
          throw new PluginCollectionQuotaExceededError('100 MiB per collection');
        }
      }
      if (
        row.level === 'plugin-project' &&
        nextBytes > PLUGIN_COLLECTION_LIMITS.maxBytesPerPluginProject
      ) {
        throw new PluginCollectionQuotaExceededError('500 MiB per plugin and project');
      }
      if (row.level === 'project' && nextBytes > PLUGIN_COLLECTION_LIMITS.maxBytesPerProject) {
        throw new PluginCollectionQuotaExceededError('2 GiB per project');
      }
    }
  }
}
