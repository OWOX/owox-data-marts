const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadStorage(relativePath, className) {
  const context = vm.createContext({
    AbstractStorage: class AbstractStorage {},
    Blob,
    console,
    require,
    setTimeout,
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

function value(value) {
  return { value };
}

function bigQueryStorage() {
  const storage = Object.create(GoogleBigQueryStorage.prototype);
  storage.config = {
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

test('BigQuery load failure preserves live table and cleans staging', async () => {
  const storage = bigQueryStorage();
  const dropped = [];
  let published = false;
  storage.checkIfGoogleBigQueryIsConnected = () => {};
  storage.createDatasetIfItDoesntExist = async () => {};
  storage.createSnapshotTableName = () => 'live_table__owox_staging_run';
  storage._buildCreateTableQuery = () => ({ query: 'CREATE STAGING', existingColumns: {} });
  storage.executeQuery = async () => [];
  storage.saveSnapshotData = async () => {
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

  await storage.createTargetTable('staging_table', 'snapshot/run', false);
  await storage.mergeDataFromTempTable('external_table', 'run', 'staging_table', {
    id: 'string',
    select: 'string',
  });

  assert.match(queries[0], /`analytics`\.`staging_table`/);
  assert.match(queries[0], /`id` string/);
  assert.match(queries[0], /`select` string/);
  assert.match(queries[1], /MERGE INTO "analytics"\."staging_table"/);
  assert.match(queries[1], /tgt\."id" = src\."id"/);
  assert.doesNotMatch(queries[1], /`id`/);
});

test('Athena table existence uses the supported exact-match SHOW TABLES expression', async () => {
  const storage = athenaStorage();
  let query;
  storage.executeQuery = async params => {
    query = params.QueryString;
    return [{ table_name: 'goals.v2' }];
  };

  assert.equal(await storage.tableExists('goals.v2'), true);
  assert.equal(query, "SHOW TABLES IN `analytics` '^goals\\.v2$'");
  assert.equal(query.includes(' LIKE '), false);
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
    storage.deleteS3TempFolder('tmp/'),
    /Failed to delete 1 S3 objects: tmp\/part-1\.json/
  );
});

test('Athena load failure preserves live table and cleans run resources', async () => {
  const storage = athenaStorage();
  const droppedTables = [];
  const deletedFolders = [];
  let renameCalled = false;
  storage.createDatabaseIfNotExists = async () => {};
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
  assert.deepEqual(deletedFolders, ['snapshots/live_table_temp/run']);
});

test('Athena restores the live name when staging publication fails', async () => {
  const storage = athenaStorage();
  const renames = [];
  const droppedTables = [];
  storage.createDatabaseIfNotExists = async () => {};
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
