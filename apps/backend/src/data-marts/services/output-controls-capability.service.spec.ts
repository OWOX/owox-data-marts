import { OutputControlsCapabilityService } from './output-controls-capability.service';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';

describe('OutputControlsCapabilityService', () => {
  const svc = new OutputControlsCapabilityService();

  it('returns true for BigQuery', () => {
    expect(svc.isSupported(DataStorageType.GOOGLE_BIGQUERY)).toBe(true);
  });
  it('supports AWS_ATHENA', () => {
    expect(svc.isSupported(DataStorageType.AWS_ATHENA)).toBe(true);
  });
  it('supports Snowflake', () => {
    expect(svc.isSupported(DataStorageType.SNOWFLAKE)).toBe(true);
  });
  it('supports AWS_REDSHIFT', () => {
    expect(svc.isSupported(DataStorageType.AWS_REDSHIFT)).toBe(true);
  });
  it('returns false for Databricks', () => {
    expect(svc.isSupported(DataStorageType.DATABRICKS)).toBe(false);
  });
  it('supports legacy BigQuery', () => {
    expect(svc.isSupported(DataStorageType.LEGACY_GOOGLE_BIGQUERY)).toBe(true);
  });
});
