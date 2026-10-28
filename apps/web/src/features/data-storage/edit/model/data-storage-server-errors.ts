import type { FieldPath } from 'react-hook-form';
import { type DataStorageFormData, DataStorageType } from '../../shared';

/**
 * Maps a value the server rejected — named by its path in the update request — to the Storage
 * form input that holds it, or `null` when no input does.
 */
export function toDataStorageFormField(
  type: DataStorageType | undefined,
  field: string
): FieldPath<DataStorageFormData> | null {
  const [scope, ...rest] = field.split('.');
  if (field === 'reusableCredentialId' || (scope === 'credentials' && rest.length > 0)) {
    return 'reusableCredentialId';
  }
  if (scope !== 'config' || rest.length === 0) return null;
  // The legacy storage shows its stored Project ID read-only: there is nothing to fix there.
  if (type === DataStorageType.LEGACY_GOOGLE_BIGQUERY && field === 'config.projectId') return null;

  return field as FieldPath<DataStorageFormData>;
}
