import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';

// BigQuery names are case-sensitive; Snowflake folds only an unquoted database; others fold case.
const CASE_SENSITIVE_STORAGES: ReadonlySet<DataStorageType> = new Set([
  DataStorageType.GOOGLE_BIGQUERY,
  DataStorageType.LEGACY_GOOGLE_BIGQUERY,
]);

export function normalizeTargetName(name: string, storageType: DataStorageType): string {
  if (storageType === DataStorageType.SNOWFLAKE) {
    // The connector quotes schema and table as typed and uses the database as typed.
    // ponytail: splits on every dot, so a quoted part with a dot inside compares by its pieces.
    return name
      .split('.')
      .map(part => part.trim())
      .map((part, index) => {
        const quoted = /^".*"$/.test(part);
        const bare = quoted ? part.slice(1, -1) : part;
        return index === 0 && !quoted ? bare.toUpperCase() : bare;
      })
      .join('.');
  }
  const unquoted = name.replace(/[`"[\]]/g, '').trim();
  return CASE_SENSITIVE_STORAGES.has(storageType) ? unquoted : unquoted.toLowerCase();
}
