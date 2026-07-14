import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContext, runInContext } from 'node:vm';

const REPO_ROOT = join(__dirname, '../../../../..');

function loadStorage(relativePath: string, className: string): any {
  const source = readFileSync(join(REPO_ROOT, relativePath), 'utf8');
  const context = createContext({
    AbstractStorage: class {
      storageMarker = true;
    },
    DATA_TYPES: {},
    Date,
    Math,
    setTimeout,
  });

  runInContext(`${source}\nthis.__Storage = ${className};`, context);
  return context.__Storage;
}

const DatabricksStorage = loadStorage(
  'packages/connectors/src/Storages/Databricks/DatabricksStorage.js',
  'DatabricksStorage'
);
const SnowflakeStorage = loadStorage(
  'packages/connectors/src/Storages/Snowflake/SnowflakeStorage.js',
  'SnowflakeStorage'
);
const AwsRedshiftStorage = loadStorage(
  'packages/connectors/src/Storages/AwsRedshift/AwsRedshiftStorage.js',
  'AwsRedshiftStorage'
);

type CloneStorageCase = {
  name: string;
  Storage: any;
  config: Record<string, { value: string }>;
  connectionProperty: string;
  checkMethod: string;
  ensureMethod: string;
  publicationPattern: RegExp;
};

const cloneStorageCases: CloneStorageCase[] = [
  {
    name: 'Databricks',
    Storage: DatabricksStorage,
    config: {
      DatabricksCatalog: { value: 'catalog' },
      DatabricksSchema: { value: 'schema' },
      DestinationTableName: { value: 'events' },
    },
    connectionProperty: 'session',
    checkMethod: 'checkIfDatabricksIsConnected',
    ensureMethod: 'createCatalogAndSchemaIfNotExist',
    publicationPattern:
      /^CREATE OR REPLACE TABLE `catalog`\.`schema`\.`events` DEEP CLONE `catalog`\.`schema`\.`events__owox_stage_[a-z0-9_]+`$/,
  },
  {
    name: 'Snowflake',
    Storage: SnowflakeStorage,
    config: {
      SnowflakeDatabase: { value: 'DB' },
      SnowflakeSchema: { value: 'PUBLIC' },
      DestinationTableName: { value: 'events' },
    },
    connectionProperty: 'connection',
    checkMethod: 'checkIfSnowflakeIsConnected',
    ensureMethod: 'createDatabaseAndSchemaIfNotExist',
    publicationPattern:
      /^CREATE OR REPLACE TABLE DB\."PUBLIC"\."events" CLONE DB\."PUBLIC"\."events__owox_stage_[a-z0-9_]+" COPY GRANTS COPY TAGS$/,
  },
];

function makeCloneStorage(
  testCase: CloneStorageCase,
  options: { failLoad?: boolean; stagedRowCount?: number } = {}
): {
  storage: any;
  events: string[];
  originalColumns: Record<string, unknown>;
} {
  const events: string[] = [];
  const storage = Object.create(testCase.Storage.prototype);
  const originalColumns = { previous: { type: 'STRING' } };
  const config = {
    ...testCase.config,
    logMessage: jest.fn(),
  };

  storage.config = config;
  storage.existingColumns = originalColumns;
  storage.updatedRecordsBuffer = {};
  storage[testCase.connectionProperty] = {};
  storage[testCase.checkMethod] = jest.fn();
  storage[testCase.ensureMethod] = jest.fn(async () => undefined);
  storage.replaceTable = jest.fn(async () => {
    events.push(`stage:${config.DestinationTableName.value}`);
    return { id: { type: 'BIGINT' } };
  });
  storage.saveData = jest.fn(async () => {
    events.push(`load:${config.DestinationTableName.value}`);
    if (options.failLoad) {
      throw new Error('load failed');
    }
  });
  storage.executeQuery = jest.fn(async (sql: string) => {
    events.push(sql);
    if (sql.startsWith('SELECT COUNT(*) AS row_count')) {
      const rowCount = options.stagedRowCount ?? 1;
      return testCase.name === 'Snowflake' ? [{ ROW_COUNT: rowCount }] : [{ row_count: rowCount }];
    }
    return [];
  });

  return { storage, events, originalColumns };
}

describe.each(cloneStorageCases)('$name snapshot publication', testCase => {
  it('loads a run-specific staging table before one atomic publication statement', async () => {
    const { storage, events } = makeCloneStorage(testCase);

    await storage.replaceData([{ id: 1 }]);

    const validationIndex = events.findIndex(event =>
      event.startsWith('SELECT COUNT(*) AS row_count')
    );
    const publicationIndex = events.findIndex(event => testCase.publicationPattern.test(event));
    const cleanupIndex = events.findIndex(event => event.startsWith('DROP TABLE IF EXISTS'));
    expect(events[0]).toMatch(/^stage:events__owox_stage_[a-z0-9_]+$/);
    expect(events[1]).toMatch(/^load:events__owox_stage_[a-z0-9_]+$/);
    expect(validationIndex).toBeGreaterThan(1);
    expect(publicationIndex).toBeGreaterThan(validationIndex);
    expect(cleanupIndex).toBeGreaterThan(publicationIndex);
    expect(storage.config.DestinationTableName.value).toBe('events');
  });

  it('validates and publishes an empty staging table', async () => {
    const { storage, events } = makeCloneStorage(testCase, { stagedRowCount: 0 });

    await storage.replaceData([]);

    const validationIndex = events.findIndex(event =>
      event.startsWith('SELECT COUNT(*) AS row_count')
    );
    const publicationIndex = events.findIndex(event => testCase.publicationPattern.test(event));
    expect(events.some(event => event.startsWith('load:'))).toBe(false);
    expect(validationIndex).toBeGreaterThan(0);
    expect(publicationIndex).toBeGreaterThan(validationIndex);
  });

  it('preserves live state when the staged row count does not match', async () => {
    const { storage, events, originalColumns } = makeCloneStorage(testCase, {
      stagedRowCount: 0,
    });

    await expect(storage.replaceData([{ id: 1 }])).rejects.toThrow(
      'Snapshot staging row count mismatch'
    );

    expect(events.some(event => testCase.publicationPattern.test(event))).toBe(false);
    expect(events.at(-1)).toMatch(/^DROP TABLE IF EXISTS/);
    expect(storage.config.DestinationTableName.value).toBe('events');
    expect(storage.existingColumns).toBe(originalColumns);
  });

  it('does not publish after a failed load and still cleans staging', async () => {
    const { storage, events, originalColumns } = makeCloneStorage(testCase, { failLoad: true });

    await expect(storage.replaceData([{ id: 1 }])).rejects.toThrow('load failed');

    expect(events.some(event => testCase.publicationPattern.test(event))).toBe(false);
    expect(events.at(-1)).toMatch(/^DROP TABLE IF EXISTS/);
    expect(storage.config.DestinationTableName.value).toBe('events');
    expect(storage.existingColumns).toBe(originalColumns);
  });
});

describe('Redshift snapshot publication', () => {
  function makeRedshiftStorage(stagedRowCount = 1): { storage: any; events: string[] } {
    const events: string[] = [];
    const storage = Object.create(AwsRedshiftStorage.prototype);
    storage.config = {
      Schema: { value: 'analytics' },
      DestinationTableName: { value: 'events' },
      logMessage: jest.fn(),
    };
    storage.existingColumns = { previous: 'VARCHAR' };
    storage.checkConnection = jest.fn(async () => undefined);
    storage.createSchemaIfNotExist = jest.fn(async () => undefined);
    storage.getAListOfExistingColumns = jest.fn(async () => ({ id: 'BIGINT' }));
    storage.getTableGrantStatements = jest.fn(async (_source: string, target: string) => [
      `GRANT SELECT ON TABLE "analytics"."${target}" TO ROLE "reader"`,
    ]);
    storage.createTable = jest.fn(async () => {
      events.push(`stage:${storage.config.DestinationTableName.value}`);
      return { id: 'BIGINT' };
    });
    storage.saveData = jest.fn(async () => {
      events.push(`load:${storage.config.DestinationTableName.value}`);
    });
    storage.executeQueryWithResults = jest.fn(async (sql: string) => {
      events.push(sql.trim());
      return [{ row_count: stagedRowCount }];
    });
    storage.executeQuery = jest.fn(async (sql: string) => {
      events.push(sql.trim());
    });
    storage.executeTransaction = jest.fn(async (sqlStatements: string[]) => {
      events.push(...sqlStatements.map(sql => `transaction:${sql}`));
    });

    return { storage, events };
  }

  it('copies grants and transactionally renames only after staging is loaded', async () => {
    const { storage, events } = makeRedshiftStorage();

    await storage.replaceData([{ id: 1 }]);

    expect(events[0]).toMatch(/^stage:events__owox_stage_[a-z0-9_]+$/);
    expect(events[1]).toMatch(/^load:events__owox_stage_[a-z0-9_]+$/);
    expect(events[2]).toMatch(
      /^SELECT COUNT\(\*\) AS row_count FROM "analytics"\."events__owox_stage_[a-z0-9_]+"$/
    );
    expect(events[3]).toMatch(/^GRANT SELECT ON TABLE "analytics"\."events__owox_stage_/);
    expect(events[4]).toMatch(
      /^transaction:ALTER TABLE "analytics"\."events" RENAME TO "events__owox_backup_[a-z0-9_]+"$/
    );
    expect(events[5]).toMatch(
      /^transaction:ALTER TABLE "analytics"\."events__owox_stage_[a-z0-9_]+" RENAME TO "events"$/
    );
    expect(events[6]).toMatch(
      /^transaction:DROP TABLE "analytics"\."events__owox_backup_[a-z0-9_]+"$/
    );
    expect(events.at(-1)).toMatch(/^DROP TABLE IF EXISTS "analytics"\."events__owox_stage_/);
    expect(storage.config.DestinationTableName.value).toBe('events');
  });

  it('validates and publishes an empty staging table', async () => {
    const { storage, events } = makeRedshiftStorage(0);

    await storage.replaceData([]);

    const validationIndex = events.findIndex(event => event.startsWith('SELECT COUNT(*)'));
    const publicationIndex = events.findIndex(event => event.startsWith('transaction:ALTER'));
    expect(events.some(event => event.startsWith('load:'))).toBe(false);
    expect(validationIndex).toBeGreaterThan(0);
    expect(publicationIndex).toBeGreaterThan(validationIndex);
  });

  it('preserves live state when the staged row count does not match', async () => {
    const { storage, events } = makeRedshiftStorage(0);
    const originalColumns = storage.existingColumns;

    await expect(storage.replaceData([{ id: 1 }])).rejects.toThrow(
      'Snapshot staging row count mismatch'
    );

    expect(events.some(event => event.startsWith('transaction:'))).toBe(false);
    expect(events.at(-1)).toMatch(/^DROP TABLE IF EXISTS "analytics"\."events__owox_stage_/);
    expect(storage.config.DestinationTableName.value).toBe('events');
    expect(storage.existingColumns).toBe(originalColumns);
  });

  it('generates Redshift grants for the staging table', async () => {
    const storage = Object.create(AwsRedshiftStorage.prototype);
    storage.config = { Schema: { value: 'analytics' } };
    storage.executeQueryWithResults = jest.fn(async () => [
      {
        identity_name: 'reader role',
        identity_type: 'role',
        privilege_type: 'select',
        admin_option: true,
      },
      {
        identity_name: 'loader',
        identity_type: 'user',
        privilege_type: 'insert',
        admin_option: false,
      },
    ]);

    await expect(
      storage.getTableGrantStatements('events', 'events__owox_stage_run')
    ).resolves.toEqual([
      'GRANT SELECT ON TABLE "analytics"."events__owox_stage_run" TO ROLE "reader role" WITH GRANT OPTION',
      'GRANT INSERT ON TABLE "analytics"."events__owox_stage_run" TO "loader"',
    ]);
  });

  it('restores the live configuration and cleans staging after publication fails', async () => {
    const { storage, events } = makeRedshiftStorage();
    const originalColumns = storage.existingColumns;
    storage.executeTransaction = jest.fn(async () => {
      events.push('transaction failed');
      throw new Error('publication failed');
    });

    await expect(storage.replaceData([{ id: 1 }])).rejects.toThrow('publication failed');

    expect(events.at(-1)).toMatch(/^DROP TABLE IF EXISTS "analytics"\."events__owox_stage_/);
    expect(storage.config.DestinationTableName.value).toBe('events');
    expect(storage.existingColumns).toBe(originalColumns);
  });

  it('rolls back the reused Data API session instead of committing after a rename failure', async () => {
    const storage = Object.create(AwsRedshiftStorage.prototype);
    const calls: string[] = [];
    storage.config = { logMessage: jest.fn() };
    storage.executeQueryInSession = jest.fn(async (sql: string) => {
      calls.push(sql);
      if (sql === 'BEGIN') return { SessionId: 'snapshot-session' };
      if (sql === 'rename staging') throw new Error('rename failed');
      return {};
    });

    await expect(
      storage.executeTransaction(['rename live', 'rename staging', 'drop backup'])
    ).rejects.toThrow('rename failed');

    expect(calls).toEqual(['BEGIN', 'rename live', 'rename staging', 'ROLLBACK']);
    expect(calls).not.toContain('COMMIT');
  });
});
