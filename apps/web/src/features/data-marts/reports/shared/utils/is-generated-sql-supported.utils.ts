import { DataMartDefinitionType } from '../../../shared/enums/data-mart-definition-type.enum.ts';
import { DataStorageType } from '../../../../data-storage/shared/model/types/data-storage-type.enum.ts';

/**
 * Returns true when the generated SQL preview is supported for the given
 * data mart definition type and storage type combination.
 *
 * Currently, TABLE_PATTERN definitions are only supported on non-legacy Google BigQuery storage.
 */
export function isGeneratedSqlSupported(
  definitionType: DataMartDefinitionType | null,
  storageType: DataStorageType
): boolean {
  if (definitionType !== DataMartDefinitionType.TABLE_PATTERN) {
    return true;
  }

  return storageType === DataStorageType.GOOGLE_BIGQUERY;
}
