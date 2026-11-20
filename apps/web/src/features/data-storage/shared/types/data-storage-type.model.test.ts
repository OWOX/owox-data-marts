import { describe, it, expect } from 'vitest';
import { DataStorageTypeModel } from './data-storage-type.model';
import { DataStorageType, DataStorageStatus } from '../model/types';

describe('DataStorageTypeModel', () => {
  it('should return correct info for Google BigQuery', () => {
    const info = DataStorageTypeModel.getInfo(DataStorageType.GOOGLE_BIGQUERY);
    expect(info.displayName).toBe('Google BigQuery');
    expect(info.type).toBe(DataStorageType.GOOGLE_BIGQUERY);
  });

  it('should return correct info for AWS Athena', () => {
    const info = DataStorageTypeModel.getInfo(DataStorageType.AWS_ATHENA);
    expect(info.displayName).toBe('AWS Athena');
    expect(info.type).toBe(DataStorageType.AWS_ATHENA);
  });

  it('should return correct info for DuckDB', () => {
    const info = DataStorageTypeModel.getInfo(DataStorageType.DUCKDB);
    expect(info.displayName).toBe('DuckDB');
    expect(info.type).toBe(DataStorageType.DUCKDB);
    expect(info.status).toBe(DataStorageStatus.ACTIVE);
  });

  it('should return all types', () => {
    const types = DataStorageTypeModel.getAllTypes();
    expect(types).toHaveLength(8);
    expect(types.map(t => t.type)).toContain(DataStorageType.GOOGLE_BIGQUERY);
    expect(types.map(t => t.type)).toContain(DataStorageType.LEGACY_GOOGLE_BIGQUERY);
    expect(types.map(t => t.type)).toContain(DataStorageType.AWS_ATHENA);
    expect(types.map(t => t.type)).toContain(DataStorageType.SNOWFLAKE);
    expect(types.map(t => t.type)).toContain(DataStorageType.DATABRICKS);
    expect(types.map(t => t.type)).toContain(DataStorageType.AWS_REDSHIFT);
    expect(types.map(t => t.type)).toContain(DataStorageType.AZURE_SYNAPSE);
    expect(types.map(t => t.type)).toContain(DataStorageType.DUCKDB);
  });

  it('omits DUCKDB when disabled', () => {
    expect(DataStorageTypeModel.getOfferedTypes(false).map(t => t.type)).not.toContain(
      DataStorageType.DUCKDB
    );
  });

  it('includes DUCKDB when enabled', () => {
    expect(DataStorageTypeModel.getOfferedTypes(true).map(t => t.type)).toContain(
      DataStorageType.DUCKDB
    );
  });

  it('offers DUCKDB before the coming-soon Azure Synapse', () => {
    const types = DataStorageTypeModel.getOfferedTypes(true).map(t => t.type);
    expect(types.indexOf(DataStorageType.DUCKDB)).toBeLessThan(
      types.indexOf(DataStorageType.AZURE_SYNAPSE)
    );
  });

  it('keeps DUCKDB for an existing DuckDB storage', () => {
    expect(
      DataStorageTypeModel.getOfferedTypes(false, DataStorageType.DUCKDB).map(t => t.type)
    ).toContain(DataStorageType.DUCKDB);
  });
});
