import { describe, it, expect } from 'vitest';
import { isDataStorageConfigValid } from './storage-validation.utils';
import { DataStorageType } from '../model/types/data-storage-type.enum';
import type { DataStorage } from '../model/types/data-storage';

describe('isDataStorageConfigValid — DuckDB', () => {
  it('returns true for a DuckDB storage (empty config is always valid)', () => {
    const storage: DataStorage = {
      id: '1',
      title: 'Local DuckDB',
      type: DataStorageType.DUCKDB,
      credentials: {},
      config: {},
      createdAt: new Date(),
      modifiedAt: new Date(),
    };

    expect(isDataStorageConfigValid(storage)).toBe(true);
  });
});
