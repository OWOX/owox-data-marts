import type { FieldPath } from 'react-hook-form';
import { type DataStorageFormData, DataStorageType } from '../../shared';

/**
 * Maps a value the server rejected — named by its path in the update request — to the Storage
 * form input that holds it, or `null` when no input does.
 *
 * Request and form share the `config.*` and `credentials.*` paths for every storage except
 * BigQuery: there the request carries the parsed key file's own keys (`credentials.private_key`)
 * while the form edits the whole file in one textarea.
 */
export function toDataStorageFormField(
  type: DataStorageType | undefined,
  field: string
): FieldPath<DataStorageFormData> | null {
  const [scope, ...rest] = field.split('.');
  if ((scope !== 'config' && scope !== 'credentials') || rest.length === 0) return null;

  const isBigQuery =
    type === DataStorageType.GOOGLE_BIGQUERY || type === DataStorageType.LEGACY_GOOGLE_BIGQUERY;
  if (isBigQuery && scope === 'credentials') return 'credentials.serviceAccount';
  // The legacy storage shows its stored Project ID read-only: there is nothing to fix there.
  if (type === DataStorageType.LEGACY_GOOGLE_BIGQUERY && field === 'config.projectId') return null;

  return field as FieldPath<DataStorageFormData>;
}
