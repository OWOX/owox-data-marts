import { ConfigService } from '@nestjs/config';
import { DataStorageMapper } from './data-storage.mapper';
import { DataStorageDto } from '../dto/domain/data-storage.dto';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';

function makeMapper(dataDir: string | undefined): DataStorageMapper {
  const configService = {
    get: (key: string) => (key === 'DUCKDB_DATA_DIR' ? dataDir : undefined),
  } as unknown as ConfigService;
  const credentialsUtils = { getPublicCredentials: jest.fn() } as never;
  const credentialService = { getById: jest.fn() } as never;
  return new DataStorageMapper(credentialsUtils, credentialService, configService);
}

function makeDto(type: DataStorageType, id = 'storage-1'): DataStorageDto {
  return new DataStorageDto(
    id,
    'Local DuckDB',
    type,
    'project-1',
    {},
    new Date('2026-01-01T00:00:00.000Z'),
    new Date('2026-01-02T00:00:00.000Z'),
    0,
    0,
    null
  );
}

describe('DataStorageMapper.toApiResponse databasePath', () => {
  it('computes <DUCKDB_DATA_DIR>/<id>.duckdb for a DuckDB storage', async () => {
    const mapper = makeMapper('/data/owox-duckdb');
    const response = await mapper.toApiResponse(makeDto(DataStorageType.DUCKDB, 'abc-123'));
    expect(response.databasePath).toBe('/data/owox-duckdb/abc-123.duckdb');
  });

  it('omits databasePath for a non-DuckDB storage', async () => {
    const mapper = makeMapper('/data/owox-duckdb');
    const response = await mapper.toApiResponse(makeDto(DataStorageType.AWS_ATHENA));
    expect(response.databasePath).toBeUndefined();
  });
});
