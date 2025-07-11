import { describe, it, expect } from 'vitest';
import { DataStorageTypeModel } from './data-storage-type.model';
import { DataStorageType } from '../model/types';

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

  it('should return all types', () => {
    const types = DataStorageTypeModel.getAllTypes();
    expect(types).toHaveLength(6);
    expect(types.map(t => t.type)).toContain(DataStorageType.GOOGLE_BIGQUERY);
    expect(types.map(t => t.type)).toContain(DataStorageType.AWS_ATHENA);
    expect(types.map(t => t.type)).toContain(DataStorageType.SNOWFLAKE);
    expect(types.map(t => t.type)).toContain(DataStorageType.DATABRICKS);
    expect(types.map(t => t.type)).toContain(DataStorageType.AWS_REDSHIFT);
    expect(types.map(t => t.type)).toContain(DataStorageType.AZURE_SYNAPSE);
  });
});
