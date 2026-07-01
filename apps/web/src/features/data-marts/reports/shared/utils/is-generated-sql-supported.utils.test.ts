import { describe, expect, it } from 'vitest';
import { isGeneratedSqlSupported } from './is-generated-sql-supported.utils';
import { DataMartDefinitionType } from '../../../shared/enums/data-mart-definition-type.enum';
import { DataStorageType } from '../../../../data-storage/shared/model/types/data-storage-type.enum';

describe('isGeneratedSqlSupported', () => {
  it('returns true for non-TABLE_PATTERN definitions on any storage', () => {
    const storages = Object.values(DataStorageType);
    const nonTablePatternTypes = [
      DataMartDefinitionType.SQL,
      DataMartDefinitionType.TABLE,
      DataMartDefinitionType.VIEW,
      DataMartDefinitionType.CONNECTOR,
    ];

    for (const definitionType of nonTablePatternTypes) {
      for (const storageType of storages) {
        expect(isGeneratedSqlSupported(definitionType, storageType)).toBe(true);
      }
    }
  });

  it('returns true for TABLE_PATTERN on GOOGLE_BIGQUERY', () => {
    expect(
      isGeneratedSqlSupported(DataMartDefinitionType.TABLE_PATTERN, DataStorageType.GOOGLE_BIGQUERY)
    ).toBe(true);
  });

  it('returns false for TABLE_PATTERN on LEGACY_GOOGLE_BIGQUERY', () => {
    expect(
      isGeneratedSqlSupported(
        DataMartDefinitionType.TABLE_PATTERN,
        DataStorageType.LEGACY_GOOGLE_BIGQUERY
      )
    ).toBe(false);
  });

  it('returns false for TABLE_PATTERN on Athena', () => {
    expect(
      isGeneratedSqlSupported(DataMartDefinitionType.TABLE_PATTERN, DataStorageType.AWS_ATHENA)
    ).toBe(false);
  });

  it('returns false for TABLE_PATTERN on Snowflake', () => {
    expect(
      isGeneratedSqlSupported(DataMartDefinitionType.TABLE_PATTERN, DataStorageType.SNOWFLAKE)
    ).toBe(false);
  });

  it('returns false for TABLE_PATTERN on Redshift', () => {
    expect(
      isGeneratedSqlSupported(DataMartDefinitionType.TABLE_PATTERN, DataStorageType.AWS_REDSHIFT)
    ).toBe(false);
  });

  it('returns false for TABLE_PATTERN on Databricks', () => {
    expect(
      isGeneratedSqlSupported(DataMartDefinitionType.TABLE_PATTERN, DataStorageType.DATABRICKS)
    ).toBe(false);
  });

  it('returns true for null definitionType on any storage', () => {
    const storages = Object.values(DataStorageType);
    for (const storageType of storages) {
      expect(isGeneratedSqlSupported(null, storageType)).toBe(true);
    }
  });
});
