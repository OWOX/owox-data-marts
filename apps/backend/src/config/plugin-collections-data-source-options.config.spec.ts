import { ConfigService } from '@nestjs/config';
import type { LoggerService } from '@nestjs/common';
import { RedactingDataSourceLogger } from './data-source-options.config';
import { createPluginCollectionsDataSourceOptions } from './plugin-collections-data-source-options.config';

describe('createPluginCollectionsDataSourceOptions', () => {
  it('falls back to the main SQLite configuration', () => {
    const config = new ConfigService({ DB_TYPE: 'sqlite', SQLITE_DB_PATH: ':memory:' });

    expect(createPluginCollectionsDataSourceOptions(config)).toMatchObject({
      type: 'better-sqlite3',
      database: ':memory:',
      migrationsTableName: 'plugin_collections_migrations',
      synchronize: false,
    });
  });

  it('uses a logger that never emits collection document parameters', () => {
    const options = createPluginCollectionsDataSourceOptions(
      new ConfigService({ DB_TYPE: 'sqlite', SQLITE_DB_PATH: ':memory:', TYPEORM_LOGGING: 'all' })
    );
    expect(options.logger).toBeInstanceOf(RedactingDataSourceLogger);

    const sink = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    } as unknown as LoggerService;
    const logger = new RedactingDataSourceLogger(sink, 'all');
    logger.logQuery('INSERT document VALUES (?)', ['private document body']);
    logger.logQueryError('failed', 'UPDATE document SET document = ?', ['private document body']);
    logger.logQuerySlow(100, 'SELECT * FROM document WHERE document = ?', [
      'private document body',
    ]);

    expect(JSON.stringify(sink)).not.toContain('private document body');
    expect(sink.log).toHaveBeenCalledWith('INSERT document VALUES (?)');
    expect(sink.error).toHaveBeenCalledWith(
      '[QUERY ERROR] UPDATE document SET document = ?',
      'failed'
    );
    expect(sink.warn).toHaveBeenCalledWith(
      '[SLOW QUERY] (100ms): SELECT * FROM document WHERE document = ?'
    );
  });

  it('overrides individual MySQL options and treats blanks as absent', () => {
    const config = new ConfigService({
      DB_TYPE: 'mysql',
      DB_HOST: 'main-host',
      DB_PORT: '3306',
      DB_USERNAME: 'main-user',
      DB_PASSWORD: 'main-password',
      DB_DATABASE: 'main-db',
      PLUGIN_COLLECTIONS_DB_HOST: 'collections-host',
      PLUGIN_COLLECTIONS_DB_PORT: '  ',
      PLUGIN_COLLECTIONS_DB_DATABASE: 'collections-db',
    });

    expect(createPluginCollectionsDataSourceOptions(config)).toMatchObject({
      type: 'mysql',
      host: 'collections-host',
      port: 3306,
      username: 'main-user',
      password: 'main-password',
      database: 'collections-db',
    });
  });

  it('preserves whitespace in a configured password', () => {
    const config = new ConfigService({
      DB_TYPE: 'mysql',
      DB_HOST: 'main-host',
      DB_PORT: '3306',
      DB_USERNAME: 'main-user',
      DB_PASSWORD: 'main-password',
      DB_DATABASE: 'main-db',
      PLUGIN_COLLECTIONS_DB_PASSWORD: '  exact password  ',
    });

    expect(createPluginCollectionsDataSourceOptions(config)).toMatchObject({
      password: '  exact password  ',
    });
  });
});
