import { describe, it, expect } from 'vitest';
import { supportsOutputControls } from './output-controls-support';
import { DataStorageType } from '../../../data-storage/shared/model/types/data-storage-type.enum';

describe('supportsOutputControls', () => {
  it('returns true for BigQuery', () => {
    expect(supportsOutputControls(DataStorageType.GOOGLE_BIGQUERY)).toBe(true);
  });

  it('returns true for Athena', () => {
    expect(supportsOutputControls(DataStorageType.AWS_ATHENA)).toBe(true);
  });

  it('returns true for legacy BigQuery', () => {
    expect(supportsOutputControls(DataStorageType.LEGACY_GOOGLE_BIGQUERY)).toBe(true);
  });

  it('returns true for Redshift', () => {
    expect(supportsOutputControls(DataStorageType.AWS_REDSHIFT)).toBe(true);
  });

  it('returns true for Databricks', () => {
    expect(supportsOutputControls(DataStorageType.DATABRICKS)).toBe(true);
  });

  it('returns false for not-yet-supported storages', () => {
    expect(supportsOutputControls(DataStorageType.SNOWFLAKE)).toBe(false);
    expect(supportsOutputControls(DataStorageType.AZURE_SYNAPSE)).toBe(false);
  });
});
