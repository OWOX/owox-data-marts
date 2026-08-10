import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { isDataQualityFreshnessTypeSupported } from './data-quality-freshness-support';

describe('isDataQualityFreshnessTypeSupported', () => {
  it.each([
    [DataStorageType.GOOGLE_BIGQUERY, 'TIMESTAMP', true],
    [DataStorageType.LEGACY_GOOGLE_BIGQUERY, 'TIMESTAMP', true],
    [DataStorageType.GOOGLE_BIGQUERY, 'DATE', false],
    [DataStorageType.GOOGLE_BIGQUERY, 'DATETIME', false],
    [DataStorageType.AWS_ATHENA, 'TIMESTAMP WITH TIME ZONE', true],
    [DataStorageType.AWS_ATHENA, 'timestamp(3) with time zone', true],
    [DataStorageType.AWS_ATHENA, 'TIMESTAMP', false],
    [DataStorageType.AWS_ATHENA, 'DATE', false],
    [DataStorageType.SNOWFLAKE, 'TIMESTAMP', false],
    [DataStorageType.SNOWFLAKE, 'TIMESTAMP_TZ', false],
    [DataStorageType.SNOWFLAKE, 'TIMESTAMP_LTZ', false],
    [DataStorageType.SNOWFLAKE, 'TIMESTAMP_NTZ', false],
    [DataStorageType.AWS_REDSHIFT, 'TIMESTAMPTZ', true],
    [DataStorageType.AWS_REDSHIFT, 'TIMESTAMP WITH TIME ZONE', true],
    [DataStorageType.AWS_REDSHIFT, 'TIMESTAMP', false],
    [DataStorageType.AWS_REDSHIFT, 'DATE', false],
    [DataStorageType.DATABRICKS, 'TIMESTAMP', true],
    [DataStorageType.DATABRICKS, 'TIMESTAMP_NTZ', false],
    [DataStorageType.DATABRICKS, 'DATE', false],
  ] as const)(
    '%s type %s support is %s',
    (storageType: DataStorageType, nativeType: string, expected: boolean) => {
      expect(isDataQualityFreshnessTypeSupported(storageType, nativeType)).toBe(expected);
    }
  );
});
