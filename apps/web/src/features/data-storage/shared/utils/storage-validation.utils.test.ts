import { describe, expect, it } from 'vitest';
import { DataStorageType } from '../model/types/data-storage-type.enum';
import type { DataStorage } from '../model/types/data-storage';
import { isDataStorageConfigValid } from './storage-validation.utils';

const legacy = {
  id: 'storage-1',
  title: 'Legacy',
  type: DataStorageType.LEGACY_GOOGLE_BIGQUERY,
  config: { projectId: 'my-project', location: 'US' },
  createdAt: new Date(),
  modifiedAt: new Date(),
} satisfies DataStorage;

describe('isDataStorageConfigValid — Legacy BigQuery', () => {
  it('judges the Storage by its config alone, whatever its Credential', () => {
    for (const reusableCredential of [
      undefined,
      null,
      { access: 'pending', state: 'ready' } as const,
      { access: 'restricted', state: 'ready' } as const,
    ]) {
      expect(isDataStorageConfigValid({ ...legacy, reusableCredential })).toBe(true);
    }
    expect(isDataStorageConfigValid({ ...legacy, config: { projectId: '', location: 'US' } })).toBe(
      false
    );
  });
});

describe('isDataStorageConfigValid — DuckDB', () => {
  it('returns true for a DuckDB storage (empty config is always valid)', () => {
    const storage: DataStorage = {
      id: '1',
      title: 'Local DuckDB',
      type: DataStorageType.DUCKDB,
      config: {},
      createdAt: new Date(),
      modifiedAt: new Date(),
    };

    expect(isDataStorageConfigValid(storage)).toBe(true);
  });
});
