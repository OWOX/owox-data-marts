import { describe, expect, it } from 'vitest';
import { DataStorageType } from '../../shared';
import { toDataStorageFormField } from './data-storage-server-errors';

describe('toDataStorageFormField', () => {
  it('maps a config value to the input of the same path', () => {
    expect(toDataStorageFormField(DataStorageType.GOOGLE_BIGQUERY, 'config.projectId')).toBe(
      'config.projectId'
    );
    expect(toDataStorageFormField(DataStorageType.AWS_ATHENA, 'config.outputBucket')).toBe(
      'config.outputBucket'
    );
  });

  it.each(['reusableCredentialId', 'credentials.privateKey', 'credentials.private_key'])(
    'maps %j to the Credential field',
    field => {
      expect(toDataStorageFormField(DataStorageType.SNOWFLAKE, field)).toBe('reusableCredentialId');
    }
  );

  it.each(['config', 'credentials', 'title', 'ownerIds.0', ''])(
    'returns null for %j, which no single input holds',
    field => {
      expect(toDataStorageFormField(DataStorageType.GOOGLE_BIGQUERY, field)).toBeNull();
    }
  );

  it('returns null for the legacy storage Project ID, which is read-only', () => {
    expect(
      toDataStorageFormField(DataStorageType.LEGACY_GOOGLE_BIGQUERY, 'config.projectId')
    ).toBeNull();
    expect(toDataStorageFormField(DataStorageType.LEGACY_GOOGLE_BIGQUERY, 'config.location')).toBe(
      'config.location'
    );
  });
});
