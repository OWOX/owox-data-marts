import { describe, it, expect } from 'vitest';
import { DuckDbMapper } from './duckdb.mapper';
import { DataStorageType } from '../types';
import type { DuckDbDataStorage } from '../types/data-storage.ts';
import type { DataStorageResponseDto } from '../../api/types';

describe('DuckDbMapper', () => {
  const mapper = new DuckDbMapper();

  it('maps a DTO into an empty-config, empty-credentials DataStorage', () => {
    const dto: DataStorageResponseDto = {
      id: 'storage-1',
      title: 'Local DuckDB',
      type: DataStorageType.DUCKDB,
      credentials: null,
      config: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      modifiedAt: '2026-01-02T00:00:00.000Z',
      publishedDataMartsCount: 0,
      draftDataMartsCount: 0,
    };

    const result = mapper.mapFromDto(dto);

    expect(result).toMatchObject({
      id: 'storage-1',
      title: 'Local DuckDB',
      type: DataStorageType.DUCKDB,
      credentials: {},
      config: {},
      ownerUsers: [],
    });
    expect(result.createdAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    expect(result.modifiedAt).toEqual(new Date('2026-01-02T00:00:00.000Z'));
  });

  it('maps form data to an update request with an empty config and no credentials key', () => {
    const result = mapper.mapToUpdateRequest({});

    expect(result).toEqual({ config: {} });
  });

  it('includes an empty credentials object when the form data has a credentials key', () => {
    const result = mapper.mapToUpdateRequest({ credentials: {} });

    expect(result).toEqual({ config: {}, credentials: {} });
  });

  it('carries the server-provided databasePath onto the domain object', () => {
    const dto: DataStorageResponseDto = {
      id: 'storage-1',
      title: 'Local DuckDB',
      type: DataStorageType.DUCKDB,
      credentials: null,
      config: null,
      databasePath: '/data/owox-duckdb/storage-1.duckdb',
      createdAt: '2026-01-01T00:00:00.000Z',
      modifiedAt: '2026-01-02T00:00:00.000Z',
      publishedDataMartsCount: 0,
      draftDataMartsCount: 0,
    };

    const result = mapper.mapFromDto(dto);

    expect(result).toMatchObject({ databasePath: '/data/owox-duckdb/storage-1.duckdb' });
  });

  it('leaves databasePath undefined when the DTO omits it', () => {
    const dto: DataStorageResponseDto = {
      id: 'storage-1',
      title: 'Local DuckDB',
      type: DataStorageType.DUCKDB,
      credentials: null,
      config: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      modifiedAt: '2026-01-02T00:00:00.000Z',
      publishedDataMartsCount: 0,
      draftDataMartsCount: 0,
    };

    expect((mapper.mapFromDto(dto) as DuckDbDataStorage).databasePath).toBeUndefined();
  });
});
