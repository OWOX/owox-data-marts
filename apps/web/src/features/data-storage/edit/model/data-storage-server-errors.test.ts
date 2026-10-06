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

  it('maps a credential value to the input of the same path for non-BigQuery storages', () => {
    expect(toDataStorageFormField(DataStorageType.SNOWFLAKE, 'credentials.privateKey')).toBe(
      'credentials.privateKey'
    );
  });

  it.each([DataStorageType.GOOGLE_BIGQUERY, DataStorageType.LEGACY_GOOGLE_BIGQUERY])(
    'maps any key of the parsed key file to the Service Account textarea for %s',
    type => {
      expect(toDataStorageFormField(type, 'credentials.private_key')).toBe(
        'credentials.serviceAccount'
      );
    }
  );

  it.each(['config', 'credentials', 'title', 'ownerIds.0', ''])(
    'returns null for %j, which no single input holds',
    field => {
      expect(toDataStorageFormField(DataStorageType.GOOGLE_BIGQUERY, field)).toBeNull();
    }
  );
});
