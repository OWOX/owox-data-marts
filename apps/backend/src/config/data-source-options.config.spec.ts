import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { createDataSourceOptions, DbType } from './data-source-options.config';

describe('createDataSourceOptions', () => {
  it('does not load colocated spec files as TypeORM migrations', async () => {
    const values: Record<string, unknown> = {
      DB_TYPE: DbType.sqlite,
      SQLITE_DB_PATH: ':memory:',
      TYPEORM_LOGGING: 'error',
    };
    const config = {
      get: jest.fn((key: string, defaultValue?: unknown) => values[key] ?? defaultValue),
    } as unknown as ConfigService;

    const dataSource = new DataSource(createDataSourceOptions(config));

    try {
      await expect(dataSource.initialize()).resolves.toBe(dataSource);
      expect(dataSource.migrations.length).toBeGreaterThan(0);
    } finally {
      if (dataSource.isInitialized) await dataSource.destroy();
    }
  });
});
