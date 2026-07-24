import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'vitest';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadStorage(relativePath, className) {
  const context = vm.createContext({
    BatchExecuteStatementCommand: class BatchExecuteStatementCommand {
      constructor(input) {
        this.input = input;
      }
    },
    Blob,
    console,
    require,
    setTimeout,
  });
  const abstractStorageSource = fs.readFileSync(
    path.join(__dirname, '..', 'src/Core/AbstractStorage.js'),
    'utf8'
  );
  vm.runInContext(abstractStorageSource, context, {
    filename: 'src/Core/AbstractStorage.js',
  });
  const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
  vm.runInContext(source, context, { filename: relativePath });
  return context[className];
}

const GoogleBigQueryStorage = loadStorage(
  'src/Storages/GoogleBigQuery/GoogleBigQueryStorage.js',
  'GoogleBigQueryStorage'
);
const AwsAthenaStorage = loadStorage(
  'src/Storages/AwsAthena/AwsAthenaStorage.js',
  'AwsAthenaStorage'
);
const DatabricksStorage = loadStorage(
  'src/Storages/Databricks/DatabricksStorage.js',
  'DatabricksStorage'
);
const SnowflakeStorage = loadStorage(
  'src/Storages/Snowflake/SnowflakeStorage.js',
  'SnowflakeStorage'
);
const AwsRedshiftStorage = loadStorage(
  'src/Storages/AwsRedshift/AwsRedshiftStorage.js',
  'AwsRedshiftStorage'
);

function value(value) {
  return { value };
}

function bigQueryStorage() {
  const storage = Object.create(GoogleBigQueryStorage.prototype);
  storage.config = {
    DestinationProjectID: value('project'),
    DestinationDatasetName: value('dataset'),
    DestinationDatasetID: value('project.dataset'),
    DestinationTableName: value('live_table'),
    MaxBufferSize: value(250),
    logMessage() {},
  };
  storage.uniqueKeyColumns = ['id'];
  return storage;
}

function athenaStorage() {
  const storage = Object.create(AwsAthenaStorage.prototype);
  storage.config = {
    AthenaDatabaseName: value('analytics'),
    AthenaOutputLocation: value('s3://query-results/'),
    DestinationTableName: value('live_table'),
    S3BucketName: value('bucket'),
    S3Prefix: value('snapshots/live_table'),
    logMessage() {},
  };
  storage.uniqueKeyColumns = ['id'];
  return storage;
}

test('BigQuery publication atomically copies staging over the live table', async () => {
  const storage = bigQueryStorage();
  let query;
  storage.executeQuery = async sql => {
    query = sql;
  };

  await storage.publishSnapshotTable('live_table__owox_staging_run', 'live_table');

  assert.equal(
    query,
    'CREATE OR REPLACE TABLE `project.dataset.live_table` COPY `project.dataset.live_table__owox_staging_run`'
  );
});

test('BigQuery preserves the live table object when the schema is unchanged', async () => {
  const storage = bigQueryStorage();
  let query;
  storage.executeQuery = async sql => {
    query = sql;
  };

  await storage.publishSnapshotTable(
    'live_table__owox_staging_run',
    'live_table',
    {
      id: { type: 'INT64' },
      name: { type: 'STRING' },
    },
    true
  );

  assert.equal(
    query,
    'BEGIN TRANSACTION;\n' +
      'TRUNCATE TABLE `project.dataset.live_table`;\n' +
      'INSERT INTO `project.dataset.live_table` (`id`, `name`) SELECT `id`, `name` FROM `project.dataset.live_table__owox_staging_run`;\n' +
      'COMMIT TRANSACTION;'
  );
});

test('BigQuery full refresh quotes dynamic sheet column names', async () => {
  const storage = bigQueryStorage();
  let createQuery;
  storage.schema = { id: { type: 'INTEGER' }, select: { type: 'STRING' } };
  storage.getSelectedFields = () => ['id', 'select'];
  storage.getColumnType = column => storage.schema[column].type;
  storage.executeQuery = async query => {
    createQuery = query;
    return [];
  };

  await storage.createTableIfItDoesntExist(true);

  assert.match(createQuery, /`select` STRING/);
  storage.quoteFieldIdentifiers = true;
  storage.existingColumns = {
    id: { name: 'id', type: 'INTEGER' },
    select: { name: 'select', type: 'STRING' },
  };
  storage.stringifyNeastedFields = record => record;
  storage.obfuscateSpecialCharacters = value => String(value);
  storage.updatedRecordsBuffer = { row: { id: 1, select: 'value' } };
  const mergeQuery = storage.buildMergeQuery(['row']);
  assert.match(mergeQuery, /target\.`select` = source\.`select`/);
  assert.match(mergeQuery, /INSERT \(\s*`id`, `select`/);
});

test('BigQuery load failure preserves live table and cleans staging', async () => {
  const storage = bigQueryStorage();
  const dropped = [];
  let published = false;
  storage.checkIfGoogleBigQueryIsConnected = () => {};
  storage.createDatasetIfItDoesntExist = async () => {};
  storage.createSnapshotTableName = () => 'live_table__owox_staging_run';
  storage.createTableIfItDoesntExist = async () => ({ id: { name: 'id', type: 'INTEGER' } });
  storage.executeQuery = async () => [];
  storage.saveData = async () => {
    throw new Error('load failed');
  };
  storage.publishSnapshotTable = async () => {
    published = true;
  };
  storage.dropSnapshotTable = async tableName => {
    dropped.push(tableName);
  };

  await assert.rejects(storage.replaceData([{ id: 1 }]), /load failed/);
  assert.equal(published, false);
  assert.deepEqual(dropped, ['live_table__owox_staging_run']);
});

test('Athena uses backticks for DDL identifiers and double quotes for DML', async () => {
  const storage = athenaStorage();
  const queries = [];
  storage.schema = { id: {}, select: {} };
  storage.getSelectedFields = () => ['select'];
  storage.getColumnType = () => 'string';
  storage.getColumnComment = () => '';
  storage.executeQuery = async params => {
    queries.push(params.QueryString);
    return [];
  };

  await storage.createTargetTable('staging_table', 'snapshot/run', false, true);
  await storage.mergeDataFromTempTable(
    'external_table',
    'run',
    'staging_table',
    {
      id: 'string',
      select: 'string',
    },
    true
  );
  await storage.renameTable('staging_table', 'live_table');
  assert.match(queries[0], /`analytics`\.`staging_table`/);
  assert.equal(
    queries[2],
    'ALTER TABLE `analytics`.`staging_table` RENAME TO `analytics`.`live_table`'
  );
  assert.match(queries[0], /`select` string/);
  assert.match(queries[1], /MERGE INTO "analytics"\."staging_table"/);
  assert.match(queries[1], /tgt\."id" = src\."id"/);
  assert.match(queries[1], /UPDATE SET "id" = src\."id"/);
  assert.doesNotMatch(queries[1], /UPDATE SET tgt\./);
  assert.doesNotMatch(queries[1], /`id`/);
});

test('Athena table existence uses an exact information schema lookup', async () => {
  const storage = athenaStorage();
  storage.executeQuery = async (params, type) => {
    assert.equal(type, 'query');
    assert.match(params.QueryString, /FROM information_schema\.tables/);
    assert.match(params.QueryString, /table_name = 'goals\.v2'/);
    return [{ table_name: 'goals.v2' }];
  };

  assert.equal(await storage.tableExists('goals.v2'), true);
});

test('Athena snapshot imports use stable JSON parsing with an explicit timestamp format', async () => {
  const storage = athenaStorage();
  let query;
  storage.executeQuery = async params => {
    query = params.QueryString;
    return [];
  };

  await storage.createTempTable(
    'temp/run',
    'run',
    { imported_at: 'timestamp' },
    'temp_table',
    true,
    true
  );

  assert.match(query, /org\.apache\.hive\.hcatalog\.data\.JsonSerDe/);
  assert.match(query, /"timestamp\.formats" = "yyyy-MM-dd HH:mm:ss\.SSS"/);
  assert.doesNotMatch(query, /org\.openx\.data\.jsonserde\.JsonSerDe/);
});

test('Athena restores the newest abandoned backup before starting another snapshot', async () => {
  const storage = athenaStorage();
  const renames = [];
  storage.tableExists = async () => false;
  storage.listSnapshotTables = async () => [
    'live_table__owox_backup_run_a',
    'live_table__owox_backup_run_z',
  ];
  storage.renameTable = async (from, to) => renames.push([from, to]);

  assert.equal(await storage.recoverSnapshotBackupIfNeeded('live_table'), true);
  assert.deepEqual(renames, [['live_table__owox_backup_run_z', 'live_table']]);
});

test('Athena reports partial S3 cleanup failures', async () => {
  const storage = athenaStorage();
  storage.ListObjectsV2Command = class ListObjectsV2Command {
    constructor(input) {
      this.input = input;
    }
  };
  storage.DeleteObjectsCommand = class DeleteObjectsCommand {
    constructor(input) {
      this.input = input;
    }
  };
  storage.s3Client = {
    send: async command => {
      if (command instanceof storage.ListObjectsV2Command) {
        return { Contents: [{ Key: 'tmp/part-1.json' }] };
      }
      return { Errors: [{ Key: 'tmp/part-1.json', Code: 'AccessDenied' }] };
    },
  };

  await assert.rejects(
    storage.deleteS3TempFolder('tmp/', true),
    /Failed to delete 1 S3 objects: tmp\/part-1\.json/
  );
});

test('Athena load failure preserves live table and cleans run resources', async () => {
  const storage = athenaStorage();
  const droppedTables = [];
  const deletedFolders = [];
  let renameCalled = false;
  storage.createDatabaseIfNotExists = async () => {};
  storage.recoverSnapshotBackupIfNeeded = async () => false;
  storage.createSnapshotRunId = () => 'run';
  storage.createSnapshotTableName = kind => `live_table__owox_${kind}_run`;
  storage.createTargetTable = async () => ({ id: 'bigint' });
  storage.uploadDataToS3TempFolder = async () => {
    throw new Error('upload failed');
  };
  storage.renameTable = async () => {
    renameCalled = true;
  };
  storage.dropTempTable = async tableName => {
    droppedTables.push(tableName);
  };
  storage.deleteS3TempFolder = async folder => {
    deletedFolders.push(folder);
  };
  storage.dropTargetTable = async tableName => {
    droppedTables.push(tableName);
  };

  await assert.rejects(storage.replaceData([{ id: 1 }]), /upload failed/);
  assert.equal(renameCalled, false);
  assert.deepEqual(droppedTables, ['live_table__owox_temp_run', 'live_table__owox_staging_run']);
  assert.deepEqual(deletedFolders, [
    'snapshots/live_table_temp/run',
    'snapshots/live_table_snapshot/live_table/run',
  ]);
});

test('Athena snapshot cleanup deletes obsolete S3 data but keeps the published snapshot', async () => {
  const storage = athenaStorage();
  const listInputs = [];
  const deleteInputs = [];
  storage.ListObjectsV2Command = class ListObjectsV2Command {
    constructor(input) {
      this.input = input;
    }
  };
  storage.DeleteObjectsCommand = class DeleteObjectsCommand {
    constructor(input) {
      this.input = input;
    }
  };
  storage.s3Client = {
    async send(command) {
      if (command instanceof storage.ListObjectsV2Command) {
        listInputs.push(command.input);
        return {
          Contents: [
            { Key: 'snapshots/live_table_snapshot/live_table/old/part.json' },
            { Key: 'snapshots/live_table_snapshot/live_table/current/part.json' },
          ],
        };
      }
      deleteInputs.push(command.input);
      return {};
    },
  };

  await storage.deleteS3ObjectsExcept(
    'snapshots/live_table_snapshot/live_table',
    'snapshots/live_table_snapshot/live_table/current'
  );

  assert.deepEqual(JSON.parse(JSON.stringify(listInputs)), [
    {
      Bucket: 'bucket',
      Prefix: 'snapshots/live_table_snapshot/live_table/',
    },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(deleteInputs)), [
    {
      Bucket: 'bucket',
      Delete: {
        Objects: [{ Key: 'snapshots/live_table_snapshot/live_table/old/part.json' }],
      },
    },
  ]);
});

test('Athena restores the live name when staging publication fails', async () => {
  const storage = athenaStorage();
  const renames = [];
  const droppedTables = [];
  storage.createDatabaseIfNotExists = async () => {};
  storage.recoverSnapshotBackupIfNeeded = async () => false;
  storage.createSnapshotRunId = () => 'run';
  storage.createSnapshotTableName = kind => `live_table__owox_${kind}_run`;
  storage.createTargetTable = async () => ({ id: 'bigint' });
  storage.validateSnapshotTable = async () => {};
  storage.tableExists = async () => true;
  storage.renameTable = async (from, to) => {
    renames.push([from, to]);
    if (from === 'live_table__owox_staging_run') {
      throw new Error('publish failed');
    }
  };
  storage.dropTempTable = async tableName => {
    droppedTables.push(tableName);
  };
  storage.deleteS3TempFolder = async () => {};
  storage.dropTargetTable = async tableName => {
    droppedTables.push(tableName);
  };

  await assert.rejects(storage.replaceData([]), /publish failed/);
  assert.deepEqual(renames, [
    ['live_table', 'live_table__owox_backup_run'],
    ['live_table__owox_staging_run', 'live_table'],
    ['live_table__owox_backup_run', 'live_table'],
  ]);
  assert.deepEqual(droppedTables, ['live_table__owox_temp_run', 'live_table__owox_staging_run']);
});

const cloneStorageCases = [
  {
    name: 'Databricks',
    Storage: DatabricksStorage,
    config: {
      DatabricksCatalog: value('catalog'),
      DatabricksSchema: value('schema'),
      DestinationTableName: value('events'),
      MaxBufferSize: value(2),
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
      SnowflakeDatabase: value('DB'),
      SnowflakeSchema: value('PUBLIC'),
      DestinationTableName: value('events'),
    },
    connectionProperty: 'connection',
    checkMethod: 'checkIfSnowflakeIsConnected',
    ensureMethod: 'createDatabaseAndSchemaIfNotExist',
    publicationPattern:
      /^CREATE OR REPLACE TABLE DB\."PUBLIC"\."events" CLONE DB\."PUBLIC"\."events__owox_stage_[a-z0-9_]+" COPY GRANTS COPY TAGS$/,
  },
];

function cloneStorage(
  testCase,
  { failLoad = false, stagedRowCount = 1, liveColumns = { previous: { type: 'STRING' } } } = {}
) {
  const events = [];
  const storage = Object.create(testCase.Storage.prototype);
  const originalColumns = { previous: { type: 'STRING' } };
  storage.config = { ...testCase.config, logMessage() {} };
  storage.existingColumns = originalColumns;
  storage.uniqueKeyColumns = ['id'];
  storage.getSelectedFields = () => ['id'];
  storage.updatedRecordsBuffer = {};
  storage[testCase.connectionProperty] = {};
  storage[testCase.checkMethod] = () => {};
  storage[testCase.ensureMethod] = async () => {};
  storage.getAListOfExistingColumns = async () => liveColumns;
  storage.createTableIfItDoesntExist = async () => {
    events.push(`stage:${storage.config.DestinationTableName.value}`);
    const stagedColumns = { id: { type: 'BIGINT' } };
    storage.existingColumns = stagedColumns;
    return stagedColumns;
  };
  storage.saveData = async () => {
    events.push(`load:${storage.config.DestinationTableName.value}`);
    if (failLoad) throw new Error('load failed');
  };
  storage.executeQuery = async sql => {
    events.push(sql);
    if (sql.startsWith('SELECT COUNT(*) AS row_count')) {
      return testCase.name === 'Snowflake'
        ? [{ ROW_COUNT: stagedRowCount }]
        : [{ row_count: stagedRowCount }];
    }
    return [];
  };
  return { storage, events, originalColumns };
}

for (const testCase of cloneStorageCases) {
  test(`${testCase.name} preserves the live table object when the schema is unchanged`, async () => {
    const liveColumns = { id: { type: 'BIGINT' } };
    const { storage, events } = cloneStorage(testCase, { liveColumns });

    await storage.replaceData([{ id: 1 }]);

    const overwrite = events.find(event => event.startsWith('INSERT OVERWRITE'));
    assert.ok(overwrite);
    assert.equal(
      events.some(event => testCase.publicationPattern.test(event)),
      false
    );
  });
}

for (const testCase of cloneStorageCases) {
  test(`${testCase.name} publishes only after staging is loaded and validated`, async () => {
    const { storage, events } = cloneStorage(testCase);

    await storage.replaceData([{ id: 1 }]);

    const validationIndex = events.findIndex(event =>
      event.startsWith('SELECT COUNT(*) AS row_count')
    );
    const publicationIndex = events.findIndex(event => testCase.publicationPattern.test(event));
    assert.match(events[0], /^stage:events__owox_stage_[a-z0-9_]+$/);
    assert.match(events[1], /^load:events__owox_stage_[a-z0-9_]+$/);
    assert.ok(validationIndex > 1);
    assert.ok(publicationIndex > validationIndex);
    assert.match(events.at(-1), /^DROP TABLE IF EXISTS/);
    assert.equal(storage.config.DestinationTableName.value, 'events');
  });

  test(`${testCase.name} publishes an empty validated snapshot`, async () => {
    const { storage, events } = cloneStorage(testCase, { stagedRowCount: 0 });

    await storage.replaceData([]);

    assert.equal(
      events.some(event => event.startsWith('load:')),
      false
    );
    assert.ok(events.some(event => testCase.publicationPattern.test(event)));
  });

  test(`${testCase.name} preserves live state after a staging failure`, async () => {
    const { storage, events, originalColumns } = cloneStorage(testCase, { failLoad: true });

    await assert.rejects(storage.replaceData([{ id: 1 }]), /load failed/);

    assert.equal(
      events.some(event => testCase.publicationPattern.test(event)),
      false
    );
    assert.match(events.at(-1), /^DROP TABLE IF EXISTS/);
    assert.equal(storage.config.DestinationTableName.value, 'events');
    assert.equal(storage.existingColumns, originalColumns);
  });

  test(`${testCase.name} rejects a mismatched staged row count`, async () => {
    const { storage, events, originalColumns } = cloneStorage(testCase, { stagedRowCount: 0 });

    await assert.rejects(storage.replaceData([{ id: 1 }]), /Snapshot staging row count mismatch/);

    assert.equal(
      events.some(event => testCase.publicationPattern.test(event)),
      false
    );
    assert.equal(storage.existingColumns, originalColumns);
  });
}

test('Databricks snapshot loading batches rows before building inline MERGE statements', async () => {
  const testCase = cloneStorageCases[0];
  const { storage, events } = cloneStorage(testCase, { stagedRowCount: 5 });

  await storage.replaceData([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]);

  assert.equal(events.filter(event => event.startsWith('load:')).length, 3);
});

test('Databricks snapshot loading also respects the SQL statement byte limit', () => {
  const storage = Object.create(DatabricksStorage.prototype);
  storage.config = {
    DatabricksCatalog: value('catalog'),
    DatabricksSchema: value('schema'),
    DestinationTableName: value('events__owox_stage_run'),
  };
  storage.existingColumns = {
    id: { type: 'BIGINT' },
    payload: { type: 'STRING' },
  };
  storage.uniqueKeyColumns = ['id'];
  storage.getSelectedFields = () => ['id', 'payload'];
  const rows = [
    { id: 1, payload: 'a'.repeat(40) },
    { id: 2, payload: 'b'.repeat(40) },
  ];
  const oneRowQueryBytes = Buffer.byteLength(
    storage.buildMergeQueryWithInlineSource(
      '`catalog`.`schema`.`events__owox_stage_run`',
      storage.buildSelectStatementsForRecords([rows[0]])
    ),
    'utf8'
  );

  const batches = storage.createSnapshotBatches(rows, 250, oneRowQueryBytes + 1);

  assert.equal(batches.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(batches.flat())), rows);
});

function redshiftStorage(stagedRowCount = 1, liveColumns = { previous: 'VARCHAR' }) {
  const events = [];
  const storage = Object.create(AwsRedshiftStorage.prototype);
  storage.config = {
    Schema: value('analytics'),
    DestinationTableName: value('events'),
    MaxBufferSize: value(250),
    logMessage() {},
  };
  storage.existingColumns = { previous: 'VARCHAR' };
  storage.uniqueKeyColumns = ['id'];
  storage.getSelectedFields = () => ['id'];
  storage.checkConnection = async () => {};
  storage.createSchemaIfNotExist = async () => {};
  storage.getAListOfExistingColumns = async () => liveColumns;
  storage.getTableGrantStatements = async (_source, target) => [
    `GRANT SELECT ON TABLE "analytics"."${target}" TO ROLE "reader"`,
  ];
  storage.createTable = async () => {
    events.push(`stage:${storage.config.DestinationTableName.value}`);
    return { id: 'BIGINT' };
  };
  storage.saveData = async () => {
    events.push(`load:${storage.config.DestinationTableName.value}`);
  };
  storage.executeQueryWithResults = async sql => {
    events.push(sql.trim());
    return [{ row_count: stagedRowCount }];
  };
  storage.executeQuery = async sql => {
    events.push(sql.trim());
  };
  storage.executeTransaction = async statements => {
    events.push(...statements.map(sql => `transaction:${sql}`));
  };
  return { storage, events };
}

test('Redshift copies grants and transactionally publishes validated staging', async () => {
  const { storage, events } = redshiftStorage();

  await storage.replaceData([{ id: 1 }]);

  assert.match(events[0], /^stage:events__owox_stage_[a-z0-9_]+$/);
  assert.match(events[1], /^load:events__owox_stage_[a-z0-9_]+$/);
  assert.match(events[2], /^SELECT COUNT\(\*\) AS row_count FROM "analytics"\./);
  assert.match(events[3], /^GRANT SELECT ON TABLE "analytics"\."events__owox_stage_/);
  assert.match(events[4], /^transaction:ALTER TABLE "analytics"\."events" RENAME TO/);
  assert.match(events[5], /^transaction:ALTER TABLE "analytics"\."events__owox_stage_/);
  assert.match(events[6], /^transaction:DROP TABLE "analytics"\."events__owox_backup_/);
  assert.match(events.at(-1), /^DROP TABLE IF EXISTS "analytics"\."events__owox_stage_/);
});

test('Redshift preserves the live table object when the schema matches in a different order', async () => {
  const { storage, events } = redshiftStorage(1, { name: 'character varying', id: 'bigint' });
  storage.getSelectedFields = () => ['id', 'name'];
  storage.createTable = async () => {
    events.push(`stage:${storage.config.DestinationTableName.value}`);
    return { id: 'BIGINT', name: 'VARCHAR(65535)' };
  };

  await storage.replaceData([{ id: 1 }]);

  assert.equal(
    events.some(event => event.startsWith('GRANT ')),
    false
  );
  assert.ok(events.includes('transaction:DELETE FROM "analytics"."events"'));
  assert.ok(
    events.some(event =>
      event.startsWith(
        'transaction:INSERT INTO "analytics"."events" ("id", "name") SELECT "id", "name" FROM "analytics"."events__owox_stage_'
      )
    )
  );
  assert.equal(
    events.some(event => event.includes(' RENAME TO ')),
    false
  );
});

test('Redshift preserves live state when staging validation fails', async () => {
  const { storage, events } = redshiftStorage(0);
  const originalColumns = storage.existingColumns;

  await assert.rejects(storage.replaceData([{ id: 1 }]), /Snapshot staging row count mismatch/);

  assert.equal(
    events.some(event => event.startsWith('transaction:')),
    false
  );
  assert.equal(storage.config.DestinationTableName.value, 'events');
  assert.equal(storage.existingColumns, originalColumns);
});

test('Redshift generates grants for the staging table', async () => {
  const storage = Object.create(AwsRedshiftStorage.prototype);
  storage.config = { Schema: value('analytics') };
  storage.executeQueryWithResults = async () => [
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
  ];

  assert.deepEqual(await storage.getTableGrantStatements('events', 'events__owox_stage_run'), [
    'GRANT SELECT ON TABLE "analytics"."events__owox_stage_run" TO ROLE "reader role" WITH GRANT OPTION',
    'GRANT INSERT ON TABLE "analytics"."events__owox_stage_run" TO "loader"',
  ]);
});

test('Redshift uses the Data API transactional batch for publication', async () => {
  const storage = Object.create(AwsRedshiftStorage.prototype);
  storage.config = {
    Database: value('warehouse'),
    WorkgroupName: value('serverless'),
    ClusterIdentifier: value(''),
  };
  let command;
  storage.redshiftDataClient = {
    send: async value => {
      command = value;
      return { Id: 'statement-id' };
    },
  };
  storage.waitForQueryCompletion = async id => assert.equal(id, 'statement-id');

  await storage.executeTransaction(['rename live', 'rename staging', 'drop backup']);

  assert.deepEqual(JSON.parse(JSON.stringify(command.input)), {
    Sqls: ['rename live', 'rename staging', 'drop backup'],
    Database: 'warehouse',
    WorkgroupName: 'serverless',
  });
});

test('Redshift snapshot table names respect the 127-byte identifier limit', async () => {
  const { storage, events } = redshiftStorage(0);
  storage.config.DestinationTableName.value = '\u0434'.repeat(100);

  await storage.replaceData([]);

  const stagingTableName = events[0].slice('stage:'.length);
  assert.ok(Buffer.byteLength(stagingTableName, 'utf8') <= 127);
  assert.match(stagingTableName, /__owox_stage_[a-z0-9_]+$/);
});

test('Redshift snapshot loading respects the Data API statement byte limit', () => {
  const storage = Object.create(AwsRedshiftStorage.prototype);
  storage.config = {
    Schema: value('analytics'),
    DestinationTableName: value('events__owox_stage_run'),
  };
  storage.existingColumns = { id: 'BIGINT', payload: 'VARCHAR(65535)' };
  storage.getSelectedFields = () => ['id', 'payload'];
  const rows = [
    { id: 1, payload: 'a'.repeat(40) },
    { id: 2, payload: 'b'.repeat(40) },
  ];
  const estimateTableName = `temp_events__owox_stage_run_${Date.now()}`;
  const oneRowQueryBytes = Buffer.byteLength(
    storage.buildInsertBatchQuery(estimateTableName, ['id', 'payload'], [rows[0]]),
    'utf8'
  );

  const batches = storage.createSnapshotBatches(rows, 250, oneRowQueryBytes + 1);

  assert.equal(batches.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(batches.flat())), rows);
});
